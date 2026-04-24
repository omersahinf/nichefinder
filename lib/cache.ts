import { getOutlierReason } from "./outlier-reasons";
import type { ChannelStats, VideoStats } from "./youtube";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { normalizeKeyword } from "./niche-utils";
import type { EnrichedVideo, QuotaUsage, SearchSource } from "./search-types";
import type { ChannelTrend, VideoSample } from "./trend";
import { estimateRevenue, type VideoCategory } from "./rpm";

const CHANNEL_TTL_MS = 24 * 60 * 60 * 1000;
const VIDEO_TTL_MS = 12 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 12 * 60 * 60 * 1000;
const DAILY_QUOTA_LIMIT = 10_000;
const DAILY_QUOTA_GUARD = 9_000;

export interface SearchCacheOptions {
  query: string;
  maxResults: number;
  days?: number;
  publishedAfter?: string;
}

export interface CacheLookup<T> {
  cached: Map<string, T>;
  missingIds: string[];
}

export interface NicheSnapshot {
  keyword: string;
  filters: Record<string, unknown>;
  fetchedAt: string;
  source: SearchSource;
  results: EnrichedVideo[];
}

export type SeedChannelSource = "manual" | "mention" | "featured" | "user_search";

export interface SeedChannel {
  channelId: string;
  title: string;
  description: string;
  subs: number;
  totalViews: number;
  videoCount: number;
  country?: string;
  createdAt?: string;
  thumbnail: string;
  addedVia: SeedChannelSource;
  priority: number;
  addedAt: string;
  lastCrawledAt?: string;
}

interface ChannelRow {
  youtube_id: string;
  title: string;
  description: string | null;
  subs: number | string | null;
  total_views: number | string | null;
  video_count: number | string | null;
  country: string | null;
  created_at: string | null;
  category: string | null;
  tags?: string[] | null;
  thumbnail_url: string | null;
  fetched_at: string | null;
  trend_growth_30d?: number | string | null;
  trend_direction?: string | null;
  trend_sample_size?: number | string | null;
  avg_views_last_30?: number | string | null;
  is_monetized?: boolean | null;
}

interface VideoRow {
  youtube_id: string;
  channel_id: string;
  channel_title: string | null;
  title: string;
  description: string | null;
  views: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  duration: string | null;
  published_at: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  outlier_score: number | string | null;
  outlier_reason: string | null;
  fetched_at: string | null;
}

interface SearchCacheRow {
  keyword: string;
  filters_json: Record<string, unknown> | null;
  video_ids: string[] | null;
  results_count: number | null;
  source: SearchSource | null;
  fetched_at: string | null;
}

interface SeedChannelRow {
  channel_id: string;
  added_via: SeedChannelSource | null;
  priority: number | string | null;
  added_at: string | null;
  last_crawled_at: string | null;
}

const isFresh = (fetchedAt: string | null | undefined, ttlMs: number): boolean => {
  if (!fetchedAt) return false;
  const fetchedTime = new Date(fetchedAt).getTime();
  return Number.isFinite(fetchedTime) && Date.now() - fetchedTime <= ttlMs;
};

const todayKey = (): string => new Date().toISOString().slice(0, 10);

export const youtubeBatchUnits = (count: number): number =>
  count > 0 ? Math.ceil(count / 50) : 0;

export function isQuotaGuardActive(usage: QuotaUsage): boolean {
  return usage.configured && usage.used >= usage.guardAt;
}

export function buildSearchCacheKey(opts: SearchCacheOptions): string {
  const stable = JSON.stringify({
    q: normalizeKeyword(opts.query),
    max: opts.maxResults,
    days: opts.days ?? 0,
  });
  return `search:v1:${Buffer.from(stable).toString("base64url")}`;
}

export async function getCachedChannelStats(
  ids: string[],
): Promise<CacheLookup<ChannelStats>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const client = getSupabaseAdmin();
  if (!client || uniqueIds.length === 0) {
    return { cached: new Map(), missingIds: uniqueIds };
  }

  try {
    const { data, error } = await client
      .from("channels")
      .select(
        "youtube_id,title,description,subs,total_views,video_count,country,created_at,is_monetized,thumbnail_url,fetched_at",
      )
      .in("youtube_id", uniqueIds);

    if (error) throw error;

    const rows = new Map(
      ((data ?? []) as ChannelRow[]).map((row) => [row.youtube_id, row]),
    );
    const cached = new Map<string, ChannelStats>();
    const missingIds: string[] = [];

    for (const id of uniqueIds) {
      const row = rows.get(id);
      if (!row || !isFresh(row.fetched_at, CHANNEL_TTL_MS)) {
        missingIds.push(id);
        continue;
      }

      cached.set(id, {
        id: row.youtube_id,
        title: row.title,
        subs: Number(row.subs ?? 0),
        totalViews: Number(row.total_views ?? 0),
        videoCount: Number(row.video_count ?? 0),
        country: row.country ?? undefined,
        createdAt: row.created_at ?? "",
        thumbnail: row.thumbnail_url ?? "",
        description: row.description ?? "",
        isMonetized: row.is_monetized ?? undefined,
      });
    }

    return { cached, missingIds };
  } catch (error) {
    console.warn("[cache] channel lookup skipped", error);
    return { cached: new Map(), missingIds: uniqueIds };
  }
}

export async function getCachedVideoStats(ids: string[]): Promise<CacheLookup<VideoStats>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const client = getSupabaseAdmin();
  if (!client || uniqueIds.length === 0) {
    return { cached: new Map(), missingIds: uniqueIds };
  }

  try {
    const { data, error } = await client
      .from("videos")
      .select("youtube_id,views,likes,comments,duration,fetched_at")
      .in("youtube_id", uniqueIds);

    if (error) throw error;

    const rows = new Map(((data ?? []) as VideoRow[]).map((row) => [row.youtube_id, row]));
    const cached = new Map<string, VideoStats>();
    const missingIds: string[] = [];

    for (const id of uniqueIds) {
      const row = rows.get(id);
      if (!row || !isFresh(row.fetched_at, VIDEO_TTL_MS)) {
        missingIds.push(id);
        continue;
      }

      cached.set(id, {
        id: row.youtube_id,
        views: Number(row.views ?? 0),
        likes: Number(row.likes ?? 0),
        comments: Number(row.comments ?? 0),
        duration: row.duration ?? "",
      });
    }

    return { cached, missingIds };
  } catch (error) {
    console.warn("[cache] video lookup skipped", error);
    return { cached: new Map(), missingIds: uniqueIds };
  }
}

export async function upsertChannels(channels: ChannelStats[]): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || channels.length === 0) return;

  const fetchedAt = new Date().toISOString();
  const rows = channels.map((channel) => ({
    youtube_id: channel.id,
    title: channel.title,
    description: channel.description,
    subs: channel.subs,
    total_views: channel.totalViews,
    video_count: channel.videoCount,
    country: channel.country ?? null,
    created_at: channel.createdAt || null,
    thumbnail_url: channel.thumbnail,
    is_monetized: channel.isMonetized ?? null,
    fetched_at: fetchedAt,
  }));

  try {
    const { error } = await client.from("channels").upsert(rows, {
      onConflict: "youtube_id",
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] channel upsert skipped", error);
  }
}

export async function getChannelVideoSamples(
  channelIds: string[],
  windowDays = 90,
): Promise<Map<string, VideoSample[]>> {
  const client = getSupabaseAdmin();
  const unique = [...new Set(channelIds)].filter(Boolean);
  const samples = new Map<string, VideoSample[]>();
  if (!client || unique.length === 0) return samples;

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await client
      .from("videos")
      .select("channel_id,views,published_at")
      .in("channel_id", unique)
      .gte("published_at", since);

    if (error) throw error;

    for (const row of (data ?? []) as Array<{
      channel_id: string;
      views: number | string | null;
      published_at: string;
    }>) {
      const existing = samples.get(row.channel_id) ?? [];
      existing.push({
        views: Number(row.views ?? 0),
        publishedAt: row.published_at,
      });
      samples.set(row.channel_id, existing);
    }
  } catch (error) {
    console.warn("[cache] video samples skipped", error);
  }

  return samples;
}

export async function upsertChannelTrends(
  entries: Array<{ channelId: string; trend: ChannelTrend }>,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || entries.length === 0) return;

  const updates = entries.map(({ channelId, trend }) =>
    client
      .from("channels")
      .update({
        trend_growth_30d: trend.growth30d,
        trend_direction: trend.direction,
        trend_sample_size: trend.sampleSize,
        avg_views_last_30: trend.avgRecent,
      })
      .eq("youtube_id", channelId),
  );

  try {
    const results = await Promise.all(updates);
    for (const { error } of results) {
      if (error) throw error;
    }
  } catch (error) {
    console.warn("[cache] channel trend upsert skipped", error);
  }
}

export async function upsertChannelCategory(
  channelId: string,
  category: string,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || !channelId || !category) return;

  try {
    const { error } = await client
      .from("channels")
      .update({ category })
      .eq("youtube_id", channelId);
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] channel category upsert skipped", error);
  }
}

export async function upsertChannelTags(
  channelId: string,
  tags: string[],
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || !channelId) return;

  const normalized = [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
    .slice(0, 20);

  try {
    const { error } = await client
      .from("channels")
      .update({ tags: normalized })
      .eq("youtube_id", channelId);
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] channel tags upsert skipped", error);
  }
}

export async function getCachedChannelCategories(
  channelIds: string[],
): Promise<Map<string, string>> {
  const client = getSupabaseAdmin();
  const unique = [...new Set(channelIds)].filter(Boolean);
  const result = new Map<string, string>();
  if (!client || unique.length === 0) return result;

  try {
    const { data, error } = await client
      .from("channels")
      .select("youtube_id,category")
      .in("youtube_id", unique);

    if (error) throw error;

    for (const row of (data ?? []) as ChannelRow[]) {
      if (row.category) result.set(row.youtube_id, row.category);
    }
  } catch (error) {
    console.warn("[cache] channel category read skipped", error);
  }

  return result;
}

export async function getCachedChannelTrends(
  channelIds: string[],
): Promise<Map<string, ChannelTrend>> {
  const client = getSupabaseAdmin();
  const unique = [...new Set(channelIds)].filter(Boolean);
  const result = new Map<string, ChannelTrend>();
  if (!client || unique.length === 0) return result;

  try {
    const { data, error } = await client
      .from("channels")
      .select(
        "youtube_id,trend_growth_30d,trend_direction,trend_sample_size,avg_views_last_30",
      )
      .in("youtube_id", unique);

    if (error) throw error;

    for (const row of (data ?? []) as ChannelRow[]) {
      const direction = row.trend_direction;
      const growth = row.trend_growth_30d;
      if (!direction || growth === null || growth === undefined) continue;
      if (direction !== "rising" && direction !== "flat" && direction !== "falling") continue;

      result.set(row.youtube_id, {
        growth30d: Number(growth),
        direction,
        avgRecent: Number(row.avg_views_last_30 ?? 0),
        avgPrior: 0,
        sampleSize: Number(row.trend_sample_size ?? 0),
      });
    }
  } catch (error) {
    console.warn("[cache] channel trend read skipped", error);
  }

  return result;
}

export async function promoteToSeed(
  channelIds: string[],
  addedVia: SeedChannelSource = "user_search",
  priority = 10,
): Promise<void> {
  const client = getSupabaseAdmin();
  const uniqueIds = [...new Set(channelIds)].filter(Boolean);
  if (!client || uniqueIds.length === 0) return;

  const rows = uniqueIds.map((channelId) => ({
    channel_id: channelId,
    added_via: addedVia,
    priority,
  }));

  try {
    const { error } = await client.from("seed_channels").upsert(rows, {
      onConflict: "channel_id",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] seed promotion skipped", error);
  }
}

export async function upsertSeedChannel(
  channelId: string,
  addedVia: SeedChannelSource = "manual",
  priority = 50,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const { error } = await client.from("seed_channels").upsert(
    {
      channel_id: channelId,
      added_via: addedVia,
      priority,
    },
    { onConflict: "channel_id" },
  );

  if (error) throw error;
}

export async function listSeedChannels(limit = 100): Promise<SeedChannel[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data: seedData, error: seedError } = await client
    .from("seed_channels")
    .select("channel_id,added_via,priority,added_at,last_crawled_at")
    .order("priority", { ascending: false })
    .limit(limit);

  if (seedError) throw seedError;

  const seedRows = (seedData ?? []) as SeedChannelRow[];
  const channelIds = seedRows.map((row) => row.channel_id);
  if (channelIds.length === 0) return [];

  const { data: channelData, error: channelError } = await client
    .from("channels")
    .select(
      "youtube_id,title,description,subs,total_views,video_count,country,created_at,category,is_monetized,thumbnail_url,fetched_at",
    )
    .in("youtube_id", channelIds);

  if (channelError) throw channelError;

  const channels = new Map(
    ((channelData ?? []) as ChannelRow[]).map((row) => [row.youtube_id, row]),
  );

  return seedRows
    .sort((a, b) => {
      const priorityDiff = Number(b.priority ?? 0) - Number(a.priority ?? 0);
      if (priorityDiff !== 0) return priorityDiff;
      if (!a.last_crawled_at && b.last_crawled_at) return -1;
      if (a.last_crawled_at && !b.last_crawled_at) return 1;
      return (a.last_crawled_at ?? "").localeCompare(b.last_crawled_at ?? "");
    })
    .flatMap((seed): SeedChannel[] => {
      const channel = channels.get(seed.channel_id);
      if (!channel) return [];

      return [
        {
          channelId: seed.channel_id,
          title: channel.title,
          description: channel.description ?? "",
          subs: Number(channel.subs ?? 0),
          totalViews: Number(channel.total_views ?? 0),
          videoCount: Number(channel.video_count ?? 0),
          country: channel.country ?? undefined,
          createdAt: channel.created_at ?? undefined,
          thumbnail: channel.thumbnail_url ?? "",
          addedVia: seed.added_via ?? "manual",
          priority: Number(seed.priority ?? 0),
          addedAt: seed.added_at ?? "",
          lastCrawledAt: seed.last_crawled_at ?? undefined,
        },
      ];
    });
}

export async function markSeedChannelsCrawled(channelIds: string[]): Promise<void> {
  const client = getSupabaseAdmin();
  const uniqueIds = [...new Set(channelIds)].filter(Boolean);
  if (!client || uniqueIds.length === 0) return;

  const { error } = await client
    .from("seed_channels")
    .update({ last_crawled_at: new Date().toISOString() })
    .in("channel_id", uniqueIds);

  if (error) throw error;
}

export async function upsertVideos(videos: EnrichedVideo[]): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || videos.length === 0) return;

  const fetchedAt = new Date().toISOString();
  const rows = videos.map((video) => ({
    youtube_id: video.id,
    channel_id: video.channelId,
    channel_title: video.channelTitle,
    title: video.title,
    description: video.description,
    views: video.views,
    likes: video.likes,
    comments: video.comments,
    duration: video.duration,
    published_at: video.publishedAt,
    thumbnail_url: video.thumbnail,
    tags: video.tags ?? [],
    outlier_score: video.outlierScore,
    outlier_reason: video.outlierReason,
    fetched_at: fetchedAt,
  }));

  try {
    const { error } = await client.from("videos").upsert(rows, {
      onConflict: "youtube_id",
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] video upsert skipped", error);
  }
}

async function hydrateCachedVideos(ids: string[]): Promise<EnrichedVideo[]> {
  const client = getSupabaseAdmin();
  const orderedIds = ids.filter(Boolean);
  if (!client || orderedIds.length === 0) return [];

  const { data: videoData, error: videoError } = await client
    .from("videos")
    .select(
      "youtube_id,channel_id,channel_title,title,description,views,likes,comments,duration,published_at,thumbnail_url,tags,outlier_score,outlier_reason,fetched_at",
    )
    .in("youtube_id", orderedIds);

  if (videoError) throw videoError;

  const videoRows = (videoData ?? []) as VideoRow[];
  const channelIds = [...new Set(videoRows.map((row) => row.channel_id))];
  if (channelIds.length === 0) return [];

  const { data: channelData, error: channelError } = await client
    .from("channels")
    .select(
      "youtube_id,title,description,subs,total_views,video_count,country,created_at,thumbnail_url,fetched_at",
    )
    .in("youtube_id", channelIds);

  if (channelError) throw channelError;

  const channelMap = new Map(
    ((channelData ?? []) as ChannelRow[]).map((row) => [row.youtube_id, row]),
  );

  const resultMap = new Map<string, EnrichedVideo>();
  for (const row of videoRows) {
    const channel = channelMap.get(row.channel_id);
    if (!channel) continue;

    const views = Number(row.views ?? 0);
    const channelVideoCount = Number(channel.video_count ?? 0);
    const channelTotalViews = Number(channel.total_views ?? 0);
    const channelAvgViews =
      channelVideoCount > 0 ? channelTotalViews / channelVideoCount : Math.max(views, 1);
    const outlierScore =
      channelAvgViews > 0 ? views / channelAvgViews : Number(row.outlier_score ?? 0);

    const video = {
      id: row.youtube_id,
      channelId: row.channel_id,
      channelTitle: row.channel_title || channel.title,
      title: row.title,
      description: row.description ?? "",
      publishedAt: row.published_at,
      thumbnail: row.thumbnail_url ?? "",
      tags: row.tags ?? [],
      views,
      likes: Number(row.likes ?? 0),
      comments: Number(row.comments ?? 0),
      duration: row.duration ?? "",
      channelSubs: Number(channel.subs ?? 0),
      channelAvgViews,
      channelTotalViews,
      channelVideoCount,
      channelCreatedAt: channel.created_at ?? undefined,
      channelCountry: channel.country ?? undefined,
      channelThumbnail: channel.thumbnail_url ?? undefined,
      outlierScore,
      isMonetized: channel.is_monetized ?? undefined,
    };

    const category = channel.category as VideoCategory | null;
    const revenue = category ? estimateRevenue(views, category) : null;

    resultMap.set(row.youtube_id, {
      ...video,
      outlierReason: row.outlier_reason || getOutlierReason(video),
      category: revenue?.category ?? channel.category ?? undefined,
      rpmUsd: revenue?.rpmUsd,
      estimatedRevenueUsd: revenue?.estimatedRevenueUsd,
    });
  }

  return orderedIds.flatMap((id) => {
    const video = resultMap.get(id);
    return video ? [video] : [];
  });
}

export async function getCachedSearch(
  opts: SearchCacheOptions,
): Promise<EnrichedVideo[] | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("search_cache")
      .select("keyword,filters_json,video_ids,results_count,source,fetched_at")
      .eq("cache_key", buildSearchCacheKey(opts))
      .maybeSingle();

    if (error) throw error;

    const row = data as SearchCacheRow | null;
    if (!row || !isFresh(row.fetched_at, SEARCH_TTL_MS)) return null;

    const videoIds = row.video_ids ?? [];
    const hydrated = await hydrateCachedVideos(videoIds);
    if (hydrated.length < videoIds.length) return null;

    const filtered = opts.publishedAfter
      ? hydrated.filter(
          (video) => new Date(video.publishedAt).getTime() >= new Date(opts.publishedAfter!).getTime(),
        )
      : hydrated;

    return filtered.slice(0, opts.maxResults);
  } catch (error) {
    console.warn("[cache] search lookup skipped", error);
    return null;
  }
}

export async function writeSearchCache(
  opts: SearchCacheOptions,
  results: EnrichedVideo[],
  source: SearchSource,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || source === "mock") return;

  const fetchedAt = new Date().toISOString();
  try {
    const { error } = await client.from("search_cache").upsert(
      {
        cache_key: buildSearchCacheKey(opts),
        keyword: opts.query,
        normalized_keyword: normalizeKeyword(opts.query),
        filters_json: {
          maxResults: opts.maxResults,
          days: opts.days ?? 0,
          publishedAfter: opts.publishedAfter ?? null,
        },
        video_ids: results.map((video) => video.id),
        results_count: results.length,
        source,
        fetched_at: fetchedAt,
      },
      { onConflict: "cache_key" },
    );
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] search write skipped", error);
  }
}

export async function logSearch(
  keyword: string,
  filters: Record<string, unknown>,
  count: number,
  meta: {
    source: SearchSource;
    fallbackReason?: string;
    quotaUnits?: number;
  },
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  try {
    const { error } = await client.from("searches").insert({
      keyword,
      normalized_keyword: normalizeKeyword(keyword),
      filters_json: filters,
      results_count: count,
      source: meta.source,
      fallback_reason: meta.fallbackReason ?? null,
      quota_units: meta.quotaUnits ?? 0,
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] search log skipped", error);
  }
}

export async function recordApiUsage(
  units: number,
  context: Record<string, unknown>,
  source = "youtube",
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || units <= 0) return;

  try {
    const { error } = await client.from("api_usage").insert({
      day: todayKey(),
      source,
      units,
      context,
    });
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] quota log skipped", error);
  }
}

export async function getTodayQuotaUsage(): Promise<QuotaUsage> {
  const base = {
    configured: isSupabaseConfigured(),
    used: 0,
    limit: DAILY_QUOTA_LIMIT,
    remaining: DAILY_QUOTA_LIMIT,
    guardAt: DAILY_QUOTA_GUARD,
  };

  const client = getSupabaseAdmin();
  if (!client) return base;

  try {
    const { data, error } = await client
      .from("api_usage")
      .select("units")
      .eq("day", todayKey());

    if (error) throw error;

    const used = (data ?? []).reduce(
      (sum, row: { units: number | string | null }) => sum + Number(row.units ?? 0),
      0,
    );

    return {
      ...base,
      used,
      remaining: Math.max(0, DAILY_QUOTA_LIMIT - used),
    };
  } catch (error) {
    console.warn("[cache] quota read skipped", error);
    return base;
  }
}

export async function getLatestNicheSnapshot(
  keyword: string,
): Promise<NicheSnapshot | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  try {
    const { data, error } = await client
      .from("search_cache")
      .select("keyword,filters_json,video_ids,results_count,source,fetched_at")
      .eq("normalized_keyword", normalizeKeyword(keyword))
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    const row = data as SearchCacheRow | null;
    if (!row) return null;

    const results = await hydrateCachedVideos(row.video_ids ?? []);
    return {
      keyword: row.keyword,
      filters: row.filters_json ?? {},
      fetchedAt: row.fetched_at ?? "",
      source: row.source ?? "cache",
      results,
    };
  } catch (error) {
    console.warn("[cache] niche snapshot skipped", error);
    return null;
  }
}
