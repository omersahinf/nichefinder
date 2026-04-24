import {
  getChannelVideoSamples,
  getExistingVideoIds,
  listSeedChannels,
  markSeedChannelsCrawled,
  recordApiUsage,
  upsertChannels,
  upsertChannelTags,
  upsertChannelTrends,
  upsertVideos,
  youtubeBatchUnits,
} from "./cache";
import { classifyVideoCategory, estimateRevenue } from "./rpm";
import { fetchChannelRss } from "./rss";
import { computeChannelTrend } from "./trend";
import { estimateMonetized } from "./monetization";
import { getOutlierReason } from "./outlier-reasons";
import { getChannelStats, getVideoStats } from "./youtube";
import type { ChannelStats, VideoStats } from "./youtube";
import type { EnrichedVideo } from "./search-types";
import type { ChannelTrend } from "./trend";

export interface RefreshSeedsOptions {
  channelIds?: string[];
  limit?: number;
  usageSource?: string;
}

export interface RefreshSeedsResult {
  seeds: number;
  newVideos: number;
  refreshedChannels: number;
  units: number;
}

interface RssVideoRef {
  videoId: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  title: string;
}

const thumbnailFor = (videoId: string): string =>
  `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

function buildEnrichedVideo(
  ref: RssVideoRef,
  stat: VideoStats,
  channel: ChannelStats,
): EnrichedVideo {
  const channelAvgViews =
    channel.videoCount > 0 ? channel.totalViews / channel.videoCount : Math.max(stat.views, 1);
  const outlierScore = channelAvgViews > 0 ? stat.views / channelAvgViews : 0;
  const categoryMatch = classifyVideoCategory(ref.title, stat.tags ?? []);
  const revenue = estimateRevenue(stat.views, categoryMatch.category);
  const isMonetized =
    channel.isMonetized ??
    estimateMonetized({
      subs: channel.subs,
      videoCount: channel.videoCount,
      createdAt: channel.createdAt,
    });

  const video = {
    id: ref.videoId,
    channelId: ref.channelId,
    channelTitle: ref.channelTitle,
    title: ref.title,
    description: "",
    publishedAt: ref.publishedAt,
    thumbnail: thumbnailFor(ref.videoId),
    tags: stat.tags ?? [],
    views: stat.views,
    likes: stat.likes,
    comments: stat.comments,
    duration: stat.duration,
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
    ...video,
    outlierReason: getOutlierReason(video),
  };
}

export async function refreshSeedChannels(
  options: RefreshSeedsOptions = {},
): Promise<RefreshSeedsResult> {
  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY missing");
  }

  const seedChannels =
    options.channelIds && options.channelIds.length > 0
      ? (await listSeedChannels(500)).filter((seed) =>
          options.channelIds?.includes(seed.channelId),
        )
      : await listSeedChannels(options.limit ?? 200);

  if (seedChannels.length === 0) {
    return { seeds: 0, newVideos: 0, refreshedChannels: 0, units: 0 };
  }

  const rssRefs: RssVideoRef[] = [];
  for (const seed of seedChannels) {
    try {
      const entries = await fetchChannelRss(seed.channelId);
      rssRefs.push(
        ...entries.map((entry) => ({
          videoId: entry.videoId,
          channelId: seed.channelId,
          channelTitle: seed.title,
          publishedAt: entry.publishedAt,
          title: entry.title,
        })),
      );
    } catch (error) {
      console.warn("[refresh-seeds] RSS skipped", seed.channelId, error);
    }
  }

  const existingIds = await getExistingVideoIds(rssRefs.map((ref) => ref.videoId));
  const newRefs = rssRefs.filter((ref) => !existingIds.has(ref.videoId));
  const newIds = [...new Set(newRefs.map((ref) => ref.videoId))];
  const seedIds = seedChannels.map((seed) => seed.channelId);

  const [videoStats, freshChannels] = await Promise.all([
    getVideoStats(newIds),
    getChannelStats(seedIds),
  ]);

  const channelsWithMonetization = freshChannels.map((channel) => ({
    ...channel,
    isMonetized: estimateMonetized({
      subs: channel.subs,
      videoCount: channel.videoCount,
      createdAt: channel.createdAt,
    }),
  }));

  await upsertChannels(channelsWithMonetization);

  const statsMap = new Map(videoStats.map((stat) => [stat.id, stat]));
  const channelMap = new Map(channelsWithMonetization.map((channel) => [channel.id, channel]));

  const videos = newRefs.flatMap((ref): EnrichedVideo[] => {
    const stat = statsMap.get(ref.videoId);
    const channel = channelMap.get(ref.channelId);
    if (!stat || !channel) return [];
    return [buildEnrichedVideo(ref, stat, channel)];
  });

  await upsertVideos(videos);

  const tagCountsByChannel = new Map<string, Map<string, number>>();
  for (const video of videos) {
    for (const tag of video.tags ?? []) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) continue;
      const counts = tagCountsByChannel.get(video.channelId) ?? new Map<string, number>();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      tagCountsByChannel.set(video.channelId, counts);
    }
  }

  await Promise.all(
    [...tagCountsByChannel.entries()].map(([channelId, counts]) =>
      upsertChannelTags(
        channelId,
        [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([tag]) => tag),
      ),
    ),
  );

  const samples = await getChannelVideoSamples(seedIds, 90);
  const trends: Array<{ channelId: string; trend: ChannelTrend }> = [];
  for (const channelId of seedIds) {
    const trend = computeChannelTrend(samples.get(channelId) ?? []);
    if (trend) trends.push({ channelId, trend });
  }
  await upsertChannelTrends(trends);
  await markSeedChannelsCrawled(seedIds);

  const units = youtubeBatchUnits(newIds.length) + youtubeBatchUnits(seedIds.length);
  await recordApiUsage(
    units,
    {
      job: "refresh-seeds",
      seeds: seedChannels.length,
      newVideos: videos.length,
    },
    options.usageSource ?? "cron",
  );

  return {
    seeds: seedChannels.length,
    newVideos: videos.length,
    refreshedChannels: channelsWithMonetization.length,
    units,
  };
}
