import { getMockSearchResults } from "./mock-youtube";
import {
  getCachedChannelStats,
  getCachedChannelCategories,
  getCachedChannelTrends,
  getCachedSearch,
  getCachedVideoStats,
  getChannelVideoSamples,
  promoteToSeed,
  upsertChannelCategory,
  upsertChannelTags,
  upsertChannelTrends,
  upsertChannels,
  upsertVideos,
  writeSearchCache,
  youtubeBatchUnits,
} from "./cache";
import { getOutlierReason } from "./outlier-reasons";
import { computeChannelTrend } from "./trend";
import type { ChannelTrend } from "./trend";
import type { EnrichedVideo, SearchAndEnrichResult } from "./search-types";
import { classifyVideoCategory, estimateRevenue, type VideoCategory } from "./rpm";
import { estimateMonetized } from "./monetization";

const API_BASE = "https://www.googleapis.com/youtube/v3";

const apiKey = (): string => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY missing");
  return key;
};

export interface VideoSnippet {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  tags?: string[];
}

export interface VideoStats {
  id: string;
  views: number;
  likes: number;
  comments: number;
  duration: string;
  tags?: string[];
}

export interface ChannelStats {
  id: string;
  title: string;
  subs: number;
  totalViews: number;
  videoCount: number;
  country?: string;
  createdAt: string;
  thumbnail: string;
  description: string;
  isMonetized?: boolean;
}

interface SearchResponseItem {
  id?: {
    videoId?: string;
  };
  snippet?: {
    channelId?: string;
    channelTitle?: string;
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: {
        url?: string;
      };
    };
  };
}

interface VideosResponseItem {
  id?: string;
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
  snippet?: {
    tags?: string[];
  };
}

interface ChannelsResponseItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    country?: string;
    thumbnails?: {
      medium?: {
        url?: string;
      };
    };
  };
  statistics?: {
    subscriberCount?: string;
    viewCount?: string;
    videoCount?: string;
  };
}

interface YoutubeApiResponse<TItem> {
  items?: TItem[];
  error?: {
    message?: string;
  };
}

type SearchOptions = {
  query: string;
  maxResults?: number;
  order?: "relevance" | "date" | "viewCount" | "rating";
  publishedAfter?: string;
  regionCode?: string;
};

type SearchAndEnrichOptions = {
  publishedAfter?: string;
  days?: number;
  forceMock?: boolean;
};

async function fetchYoutubeJson<TItem>(
  path: string,
  params: URLSearchParams,
  revalidate: number,
): Promise<YoutubeApiResponse<TItem>> {
  const res = await fetch(`${API_BASE}/${path}?${params}`, {
    next: { revalidate },
  });
  const data = (await res.json()) as YoutubeApiResponse<TItem>;

  if (!res.ok) {
    const details = data.error?.message ? ` - ${data.error.message}` : "";
    throw new Error(`YouTube ${path} failed: ${res.status}${details}`);
  }

  return data;
}

export async function searchVideos(opts: SearchOptions): Promise<VideoSnippet[]> {
  const params = new URLSearchParams({
    key: apiKey(),
    part: "snippet",
    type: "video",
    q: opts.query,
    maxResults: String(opts.maxResults ?? 25),
    order: opts.order ?? "relevance",
  });

  if (opts.publishedAfter) params.set("publishedAfter", opts.publishedAfter);
  if (opts.regionCode) params.set("regionCode", opts.regionCode);

  const data = await fetchYoutubeJson<SearchResponseItem>("search", params, 300);

  return (data.items ?? []).flatMap((item) => {
    const videoId = item.id?.videoId;
    const snippet = item.snippet;

    if (
      !videoId ||
      !snippet?.channelId ||
      !snippet.channelTitle ||
      !snippet.title ||
      !snippet.publishedAt
    ) {
      return [];
    }

    return [
      {
        id: videoId,
        channelId: snippet.channelId,
        channelTitle: snippet.channelTitle,
        title: snippet.title,
        description: snippet.description ?? "",
        publishedAt: snippet.publishedAt,
        thumbnail: snippet.thumbnails?.medium?.url ?? "",
        tags: [],
      },
    ];
  });
}

export async function getVideoStats(ids: string[]): Promise<VideoStats[]> {
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  const all: VideoStats[] = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams({
      key: apiKey(),
      part: "snippet,statistics,contentDetails",
      id: chunk.join(","),
    });

    const data = await fetchYoutubeJson<VideosResponseItem>("videos", params, 300);
    for (const item of data.items ?? []) {
      if (!item.id) continue;
      all.push({
        id: item.id,
        views: Number(item.statistics?.viewCount ?? 0),
        likes: Number(item.statistics?.likeCount ?? 0),
        comments: Number(item.statistics?.commentCount ?? 0),
        duration: item.contentDetails?.duration ?? "",
        tags: item.snippet?.tags ?? [],
      });
    }
  }

  return all;
}

export async function getChannelStats(ids: string[]): Promise<ChannelStats[]> {
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  const all: ChannelStats[] = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams({
      key: apiKey(),
      part: "snippet,statistics",
      id: chunk.join(","),
    });

    const data = await fetchYoutubeJson<ChannelsResponseItem>("channels", params, 600);
    for (const item of data.items ?? []) {
      if (!item.id || !item.snippet?.title || !item.snippet.publishedAt) continue;
      all.push({
        id: item.id,
        title: item.snippet.title,
        subs: Number(item.statistics?.subscriberCount ?? 0),
        totalViews: Number(item.statistics?.viewCount ?? 0),
        videoCount: Number(item.statistics?.videoCount ?? 0),
        country: item.snippet.country,
        createdAt: item.snippet.publishedAt,
        thumbnail: item.snippet.thumbnails?.medium?.url ?? "",
        description: item.snippet.description ?? "",
      });
    }
  }

  return all;
}

export async function searchAndEnrich(
  query: string,
  maxResults = 25,
  optionsOrPublishedAfter?: SearchAndEnrichOptions | string,
): Promise<SearchAndEnrichResult> {
  const options =
    typeof optionsOrPublishedAfter === "string"
      ? { publishedAfter: optionsOrPublishedAfter }
      : optionsOrPublishedAfter ?? {};
  const cacheOptions = {
    query,
    maxResults,
    days: options.days,
    publishedAfter: options.publishedAfter,
  };

  const cachedResults = await getCachedSearch(cacheOptions);
  if (cachedResults) {
    const cachedChannelIds = [...new Set(cachedResults.map((video) => video.channelId))];
    const [trendMap, categoryMap] = await Promise.all([
      getCachedChannelTrends(cachedChannelIds),
      getCachedChannelCategories(cachedChannelIds),
    ]);
    const withTrend = cachedResults.map((video) => {
      const category = video.category ?? categoryMap.get(video.channelId);
      const revenue = category
        ? estimateRevenue(video.views, category as VideoCategory)
        : null;

      return {
        ...video,
        channelTrend: trendMap.get(video.channelId) ?? null,
        category,
        rpmUsd: video.rpmUsd ?? revenue?.rpmUsd,
        estimatedRevenueUsd:
          video.estimatedRevenueUsd ?? revenue?.estimatedRevenueUsd,
      };
    });

    await promoteToSeed(
      withTrend.slice(0, 10).map((video) => video.channelId),
      "user_search",
    );

    return {
      results: withTrend,
      source: "cache",
      cacheHit: true,
      quotaUnits: 0,
    };
  }

  if (options.forceMock) {
    return {
      results: getMockSearchResults(query, maxResults, options.publishedAfter),
      source: "mock",
      fallbackReason: "Daily YouTube quota guard active",
      quotaUnits: 0,
    };
  }

  if (!process.env.YOUTUBE_API_KEY) {
    return {
      results: getMockSearchResults(query, maxResults, options.publishedAfter),
      source: "mock",
      fallbackReason: "YOUTUBE_API_KEY missing",
      quotaUnits: 0,
    };
  }

  try {
    const videos = await searchVideos({
      query,
      maxResults,
      publishedAfter: options.publishedAfter,
    });
    let quotaUnits = 100;

    if (videos.length === 0) {
      await writeSearchCache(cacheOptions, [], "youtube");
      return { results: [], source: "youtube", quotaUnits };
    }

    const videoIds = videos.map((video) => video.id);
    const channelIds = [...new Set(videos.map((video) => video.channelId))];

    const [cachedStats, cachedChannels] = await Promise.all([
      getCachedVideoStats(videoIds),
      getCachedChannelStats(channelIds),
    ]);

    const [freshStats, freshChannels] = await Promise.all([
      getVideoStats(cachedStats.missingIds),
      getChannelStats(cachedChannels.missingIds),
    ]);

    quotaUnits +=
      youtubeBatchUnits(cachedStats.missingIds.length) +
      youtubeBatchUnits(cachedChannels.missingIds.length);

    const freshChannelsWithMonetization = freshChannels.map((channel) => ({
      ...channel,
      isMonetized: estimateMonetized({
        subs: channel.subs,
        videoCount: channel.videoCount,
        createdAt: channel.createdAt,
      }),
    }));

    await upsertChannels(freshChannelsWithMonetization);

    const statsMap = new Map([
      ...cachedStats.cached,
      ...freshStats.map((stat) => [stat.id, stat] as const),
    ]);
    const channelMap = new Map([
      ...cachedChannels.cached,
      ...freshChannelsWithMonetization.map((channel) => [channel.id, channel] as const),
    ]);

    const results = videos
      .map((video): EnrichedVideo | null => {
        const stat = statsMap.get(video.id);
        const channel = channelMap.get(video.channelId);

        if (!stat || !channel) return null;

        const channelAvgViews =
          channel.videoCount > 0 ? channel.totalViews / channel.videoCount : Math.max(stat.views, 1);
        const outlierScore = channelAvgViews > 0 ? stat.views / channelAvgViews : 0;

        const categoryMatch = classifyVideoCategory(
          video.title,
          stat.tags?.length ? stat.tags : video.tags,
          video.description,
        );
        const revenue = estimateRevenue(stat.views, categoryMatch.category);
        const isMonetized =
          channel.isMonetized ??
          estimateMonetized({
            subs: channel.subs,
            videoCount: channel.videoCount,
            createdAt: channel.createdAt,
          });

        const enriched = {
          ...video,
          ...stat,
          tags: stat.tags?.length ? stat.tags : video.tags,
          channelSubs: channel.subs,
          channelAvgViews,
          channelTotalViews: channel.totalViews,
          channelVideoCount: channel.videoCount,
          channelCreatedAt: channel.createdAt,
          channelCountry: channel.country,
          channelThumbnail: channel.thumbnail,
          outlierScore,
          category: revenue.category,
          rpmUsd: revenue.rpmUsd,
          estimatedRevenueUsd: revenue.estimatedRevenueUsd,
          isMonetized,
        };

        return {
          ...enriched,
          outlierReason: getOutlierReason(enriched),
        } satisfies EnrichedVideo;
      })
      .filter((item): item is EnrichedVideo => item !== null)
      .sort((a, b) => b.outlierScore - a.outlierScore);

    await upsertVideos(results);

    const categoryCountsByChannel = new Map<string, Map<string, number>>();
    for (const video of results) {
      if (!video.category) continue;
      const counts = categoryCountsByChannel.get(video.channelId) ?? new Map<string, number>();
      counts.set(video.category, (counts.get(video.category) ?? 0) + 1);
      categoryCountsByChannel.set(video.channelId, counts);
    }

    const categoryEntries = [...categoryCountsByChannel.entries()].flatMap(
      ([channelId, counts]) => {
        const [category] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
        return category ? [{ channelId, category }] : [];
      },
    );
    await Promise.all(
      categoryEntries.map((entry) => upsertChannelCategory(entry.channelId, entry.category)),
    );

    const tagCountsByChannel = new Map<string, Map<string, number>>();
    for (const video of results) {
      const tags = video.tags ?? [];
      if (tags.length === 0) continue;
      const counts = tagCountsByChannel.get(video.channelId) ?? new Map<string, number>();
      for (const tag of tags) {
        const normalized = tag.trim().toLowerCase();
        if (!normalized) continue;
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
      tagCountsByChannel.set(video.channelId, counts);
    }

    await Promise.all(
      [...tagCountsByChannel.entries()].map(([channelId, counts]) => {
        const tags = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([tag]) => tag);
        return upsertChannelTags(channelId, tags);
      }),
    );

    // Compute trend per channel using cached+fresh videos for each channel.
    const uniqueChannelIds = [...new Set(results.map((video) => video.channelId))];
    const samples = await getChannelVideoSamples(uniqueChannelIds, 90);
    const trendEntries: Array<{ channelId: string; trend: ChannelTrend }> = [];
    const trendMap = new Map<string, ChannelTrend>();

    for (const channelId of uniqueChannelIds) {
      const trend = computeChannelTrend(samples.get(channelId) ?? []);
      if (trend) {
        trendEntries.push({ channelId, trend });
        trendMap.set(channelId, trend);
      }
    }

    if (trendEntries.length > 0) {
      await upsertChannelTrends(trendEntries);
    }

    const resultsWithTrend = results.map((video) => ({
      ...video,
      channelTrend: trendMap.get(video.channelId) ?? null,
    }));

    await writeSearchCache(cacheOptions, resultsWithTrend, "youtube");
    await promoteToSeed(
      resultsWithTrend.slice(0, 10).map((video) => video.channelId),
      "user_search",
    );

    return { results: resultsWithTrend, source: "youtube", quotaUnits };
  } catch (error) {
    const fallbackReason =
      error instanceof Error ? error.message : "Unknown YouTube API error";

    return {
      results: getMockSearchResults(query, maxResults, options.publishedAfter),
      source: "mock",
      fallbackReason,
      quotaUnits: 0,
    };
  }
}
