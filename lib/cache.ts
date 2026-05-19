import { getOutlierReason } from "./outlier-reasons";
import type { ChannelStats, VideoStats } from "./youtube";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { normalizeKeyword } from "./niche-utils";
import { parseIsoDurationToSeconds } from "./duration";
import type { EnrichedVideo, QuotaUsage, SearchSource, StoredSearchSource } from "./search-types";
import type { ChannelTrend, VideoSample } from "./trend";
import { estimateRevenue, type VideoCategory } from "./rpm";
import { hasShortsSignal, matchesVideoFormat, type VideoFormatFilter } from "./video-format";

const CHANNEL_TTL_MS = 24 * 60 * 60 * 1000;
const VIDEO_TTL_MS = 12 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 12 * 60 * 60 * 1000;
const DAILY_QUOTA_LIMIT = 10_000;
const DAILY_QUOTA_GUARD = 9_000;
const LOW_RESULT_SEARCH_THRESHOLD = 20;

const QUERY_EXPANSIONS: Record<string, string[]> = {
  ai: [
    "artificial intelligence",
    "chatgpt",
    "generative ai",
    "machine learning",
    "automation",
  ],
};

export interface SearchCacheOptions {
  query: string;
  maxResults: number;
  days?: number;
  publishedAfter?: string;
  publishedBefore?: string;
  filterLog?: Record<string, unknown>;
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
  duration_seconds?: number | string | null;
  published_at: string;
  thumbnail_url: string | null;
  tags: string[] | null;
  outlier_score: number | string | null;
  outlier_reason: string | null;
  fetched_at: string | null;
}

interface BrowseVideoRow extends VideoRow {
  channels: ChannelRow | ChannelRow[] | null;
}

export interface BrowseFilters {
  q?: string;
  minSubs?: number;
  maxSubs?: number;
  minViews?: number;
  minOutlier?: number;
  publishedAfter?: string;
  publishedBefore?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  format?: VideoFormatFilter;
  sort?: "outlier" | "views" | "date" | "subs";
  limit?: number;
}

export interface CachedVideoSearchInput extends BrowseFilters {
  page?: number;
  pageSize?: number;
}

export interface CachedVideoSearchOutput {
  results: EnrichedVideo[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface SearchCacheRow {
  keyword: string;
  filters_json: Record<string, unknown> | null;
  video_ids: string[] | null;
  results_count: number | null;
  source: StoredSearchSource | null;
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

const isMissingDurationSecondsColumn = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "message" in error &&
  String(error.message).includes("duration_seconds");

export const youtubeBatchUnits = (count: number): number =>
  count > 0 ? Math.ceil(count / 50) : 0;

export function isQuotaGuardActive(usage: QuotaUsage): boolean {
  return usage.configured && usage.used >= usage.guardAt;
}

function normalizeStoredSource(source: StoredSearchSource | null | undefined): SearchSource {
  if (source === "mock") return "mock";
  if (source === "youtube" || source === "youtube_refresh") return "youtube_refresh";
  if (source === "database_youtube_refresh") return "database_youtube_refresh";
  return "database";
}

function sanitizeSearchTerm(value: string): string {
  return normalizeKeyword(value)
    .replace(/[,%(){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dbSearchTerms(query: string | undefined): {
  textTerms: string[];
  tagTerms: string[];
  allTerms: string[];
} {
  const normalized = sanitizeSearchTerm(query ?? "");
  if (!normalized) return { textTerms: [], tagTerms: [], allTerms: [] };

  const expanded = [normalized, ...(QUERY_EXPANSIONS[normalized] ?? [])]
    .map(sanitizeSearchTerm)
    .filter(Boolean);
  const allTerms = [...new Set(expanded)];
  const textTerms =
    normalized === "ai" ? allTerms.filter((term) => term !== "ai") : allTerms;
  const tagTerms = allTerms.filter((term) => /^[a-z0-9_-]+$/.test(term));

  return { textTerms, tagTerms, allTerms };
}

function textMatchScore(video: EnrichedVideo, terms: string[]): number {
  if (terms.length === 0) return 0;

  const title = video.title.toLowerCase();
  const description = video.description.toLowerCase();
  const tags = (video.tags ?? []).map((tag) => tag.toLowerCase());

  return terms.reduce((score, term) => {
    let next = score;
    if (title === term) next += 8;
    if (title.includes(term)) next += 5;
    if (tags.some((tag) => tag === term || tag.includes(term))) next += 4;
    if (description.includes(term)) next += 1;
    return next;
  }, 0);
}

function blendedSearchScore(video: EnrichedVideo, terms: string[]): number {
  const text = textMatchScore(video, terms);
  const outlier = Math.min(video.outlierScore, 25) / 25;
  const views = Math.min(Math.log10(Math.max(video.views, 1)), 8) / 8;
  const ageDays = Math.max(0, (Date.now() - new Date(video.publishedAt).getTime()) / 86_400_000);
  const recency = Math.max(0, 1 - Math.min(ageDays, 365) / 365);
  const subs = Math.max(video.channelSubs, 1);
  const smallChannel = 1 - Math.min(Math.log10(subs), 7) / 7;

  return text * 10 + outlier * 6 + recency * 3 + views * 2 + smallChannel * 2;
}

function sortCachedVideos(
  videos: EnrichedVideo[],
  filters: BrowseFilters,
  searchTerms: string[],
): EnrichedVideo[] {
  return [...videos].sort((a, b) => {
    switch (filters.sort) {
      case "views":
        return b.views - a.views;
      case "date":
        return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
      case "subs":
        return a.channelSubs - b.channelSubs;
      case "outlier":
      default:
        if (searchTerms.length > 0) {
          return blendedSearchScore(b, searchTerms) - blendedSearchScore(a, searchTerms);
        }
        return b.outlierScore - a.outlierScore;
    }
  });
}

function searchOrFilter(query: string | undefined): string | null {
  const { textTerms, tagTerms } = dbSearchTerms(query);
  const filters = [
    ...textTerms.flatMap((term) => [
      `title.ilike.%${term}%`,
      `description.ilike.%${term}%`,
      `channel_title.ilike.%${term}%`,
    ]),
    ...tagTerms.map((term) => `tags.cs.{${term}}`),
  ];

  return filters.length > 0 ? filters.join(",") : null;
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

export async function getExistingVideoIds(ids: string[]): Promise<Set<string>> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  const client = getSupabaseAdmin();
  if (!client || uniqueIds.length === 0) return new Set();

  try {
    const { data, error } = await client
      .from("videos")
      .select("youtube_id")
      .in("youtube_id", uniqueIds);

    if (error) throw error;

    return new Set(((data ?? []) as Array<{ youtube_id: string }>).map((row) => row.youtube_id));
  } catch (error) {
    console.warn("[cache] existing video lookup skipped", error);
    return new Set();
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
    duration_seconds: video.durationSeconds ?? parseIsoDurationToSeconds(video.duration),
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
    if (isMissingDurationSecondsColumn(error)) {
      const legacyRows = rows.map(({ duration_seconds, ...row }) => {
        void duration_seconds;
        return row;
      });
      try {
        const { error: legacyError } = await client.from("videos").upsert(legacyRows, {
          onConflict: "youtube_id",
        });
        if (legacyError) throw legacyError;
        return;
      } catch (legacyError) {
        console.warn("[cache] legacy video upsert skipped", legacyError);
        return;
      }
    }
    console.warn("[cache] video upsert skipped", error);
  }
}

function hydrateVideoRow(row: VideoRow, channel: ChannelRow): EnrichedVideo {
  const views = Number(row.views ?? 0);
  const channelVideoCount = Number(channel.video_count ?? 0);
  const channelTotalViews = Number(channel.total_views ?? 0);
  const channelAvgViews =
    channelVideoCount > 0 ? channelTotalViews / channelVideoCount : Math.max(views, 1);
  const outlierScore =
    channelAvgViews > 0 ? views / channelAvgViews : Number(row.outlier_score ?? 0);
  const duration = row.duration ?? "";

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
    duration,
    durationSeconds: Number(row.duration_seconds ?? 0) || parseIsoDurationToSeconds(duration),
    channelSubs: Number(channel.subs ?? 0),
    channelAvgViews,
    channelTotalViews,
    channelVideoCount,
    channelCreatedAt: channel.created_at ?? undefined,
    channelCountry: channel.country ?? undefined,
    channelThumbnail: channel.thumbnail_url ?? undefined,
    outlierScore,
    isMonetized: channel.is_monetized ?? undefined,
    isShort: hasShortsSignal({
      title: row.title,
      description: row.description ?? "",
      tags: row.tags ?? [],
    }),
  };

  const category = channel.category as VideoCategory | null;
  const revenue = category ? estimateRevenue(views, category) : null;

  return {
    ...video,
    outlierReason: row.outlier_reason || getOutlierReason(video),
    category: revenue?.category ?? channel.category ?? undefined,
    rpmUsd: revenue?.rpmUsd,
    estimatedRevenueUsd: revenue?.estimatedRevenueUsd,
  };
}

async function hydrateCachedVideos(ids: string[]): Promise<EnrichedVideo[]> {
  const client = getSupabaseAdmin();
  const orderedIds = ids.filter(Boolean);
  if (!client || orderedIds.length === 0) return [];

  const initialVideos = await client
    .from("videos")
    .select(
      "youtube_id,channel_id,channel_title,title,description,views,likes,comments,duration,duration_seconds,published_at,thumbnail_url,tags,outlier_score,outlier_reason,fetched_at",
    )
    .in("youtube_id", orderedIds);
  let videoData: unknown = initialVideos.data;
  let videoError = initialVideos.error;

  if (videoError && isMissingDurationSecondsColumn(videoError)) {
    const legacy = await client
      .from("videos")
      .select(
        "youtube_id,channel_id,channel_title,title,description,views,likes,comments,duration,published_at,thumbnail_url,tags,outlier_score,outlier_reason,fetched_at",
      )
      .in("youtube_id", orderedIds);
    videoData = legacy.data;
    videoError = legacy.error;
  }

  if (videoError) throw videoError;

  const videoRows = (videoData ?? []) as VideoRow[];
  const channelIds = [...new Set(videoRows.map((row) => row.channel_id))];
  if (channelIds.length === 0) return [];

  const { data: channelData, error: channelError } = await client
    .from("channels")
    .select(
      "youtube_id,title,description,subs,total_views,video_count,country,created_at,category,tags,is_monetized,thumbnail_url,fetched_at",
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
    resultMap.set(row.youtube_id, hydrateVideoRow(row, channel));
  }

  return orderedIds.flatMap((id) => {
    const video = resultMap.get(id);
    return video ? [video] : [];
  });
}

export async function browseCachedVideos(
  filters: BrowseFilters,
): Promise<EnrichedVideo[]> {
  const page = await searchCachedVideos({
    ...filters,
    page: 1,
    pageSize: filters.limit ?? 100,
  });

  return page.results;
}

export async function searchCachedVideos(
  filters: CachedVideoSearchInput,
): Promise<CachedVideoSearchOutput> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured for cached browsing");

  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(Math.max(Math.floor(filters.pageSize ?? filters.limit ?? 100), 1), 500);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchTerms = dbSearchTerms(filters.q).allTerms;

  const runQuery = (includeDurationSeconds: boolean) => {
    const durationColumn = includeDurationSeconds ? ",duration_seconds" : "";
    let query = client
      .from("videos")
      .select(
        `youtube_id,channel_id,channel_title,title,description,views,likes,comments,duration${durationColumn},published_at,thumbnail_url,tags,outlier_score,outlier_reason,fetched_at,channels!inner(youtube_id,title,description,subs,total_views,video_count,country,created_at,category,tags,is_monetized,thumbnail_url,fetched_at)`,
        { count: "exact" },
      );

    const orFilter = searchOrFilter(filters.q);
    if (orFilter) query = query.or(orFilter);
    if (filters.minSubs !== undefined) query = query.gte("channels.subs", filters.minSubs);
    if (filters.maxSubs !== undefined) query = query.lte("channels.subs", filters.maxSubs);
    if (filters.minViews !== undefined) query = query.gte("views", filters.minViews);
    if (filters.minOutlier !== undefined) query = query.gte("outlier_score", filters.minOutlier);
    if (filters.publishedAfter) query = query.gte("published_at", filters.publishedAfter);
    if (filters.publishedBefore) query = query.lte("published_at", filters.publishedBefore);
    if (includeDurationSeconds && filters.minDurationSeconds !== undefined) {
      query = query.gte("duration_seconds", filters.minDurationSeconds);
    }
    if (
      includeDurationSeconds &&
      filters.maxDurationSeconds !== undefined &&
      Number.isFinite(filters.maxDurationSeconds)
    ) {
      query = query.lte("duration_seconds", filters.maxDurationSeconds);
    }
    if (includeDurationSeconds && filters.format === "shorts") {
      query = query.lte("duration_seconds", 60);
    }
    if (includeDurationSeconds && filters.format === "standard") {
      query = query.gt("duration_seconds", 60);
    }

    switch (filters.sort) {
      case "views":
        query = query.order("views", { ascending: false });
        break;
      case "date":
        query = query.order("published_at", { ascending: false });
        break;
      case "subs":
        query = query.order("channels(subs)", { ascending: true });
        break;
      case "outlier":
      default:
        query = query.order("outlier_score", { ascending: false });
        break;
    }

    if (includeDurationSeconds) {
      return query.range(from, to);
    }

    return query.range(0, Math.min(Math.max(to, 500), 2_000));
  };

  let { data, error, count } = await runQuery(true);
  if (error && isMissingDurationSecondsColumn(error)) {
    const legacy = await runQuery(false);
    data = legacy.data;
    error = legacy.error;
    count = legacy.count;
  }
  if (error) throw error;

  const hydrated = ((data ?? []) as unknown as BrowseVideoRow[]).flatMap((row) => {
    const nested = Array.isArray(row.channels) ? row.channels[0] : row.channels;
    return nested ? [hydrateVideoRow(row, nested)] : [];
  });

  const filtered = hydrated
    .filter((video) => {
      if (
        filters.minDurationSeconds !== undefined &&
        (video.durationSeconds ?? 0) < filters.minDurationSeconds
      ) {
        return false;
      }
      if (
        filters.maxDurationSeconds !== undefined &&
        Number.isFinite(filters.maxDurationSeconds) &&
        (video.durationSeconds ?? 0) > filters.maxDurationSeconds
      ) {
        return false;
      }
      if (!matchesVideoFormat(video, filters.format)) return false;
      return true;
    });
  const sorted = sortCachedVideos(filtered, filters, searchTerms);
  const results = sorted.slice(0, pageSize);
  const totalCount = count ?? results.length;

  return {
    results,
    totalCount,
    page,
    pageSize,
    hasMore: page * pageSize < totalCount,
  };
}

export async function getCachedSearch(
  opts: SearchCacheOptions,
): Promise<{ results: EnrichedVideo[]; fetchedAt: string } | null> {
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

    const afterFiltered = opts.publishedAfter
      ? hydrated.filter(
          (video) => new Date(video.publishedAt).getTime() >= new Date(opts.publishedAfter!).getTime(),
        )
      : hydrated;
    const filtered = opts.publishedBefore
      ? afterFiltered.filter(
          (video) => new Date(video.publishedAt).getTime() <= new Date(opts.publishedBefore!).getTime(),
        )
      : afterFiltered;

    return {
      results: filtered.slice(0, opts.maxResults),
      fetchedAt: row.fetched_at ?? "",
    };
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
          publishedBefore: opts.publishedBefore ?? null,
          ...(opts.filterLog ?? {}),
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

export async function queueLowResultKeywordCandidate(
  keyword: string,
  matchCount: number,
): Promise<void> {
  const normalized = normalizeKeyword(keyword);
  const client = getSupabaseAdmin();
  if (!client || !normalized || matchCount >= LOW_RESULT_SEARCH_THRESHOLD) return;

  try {
    const { error } = await client.from("seed_keywords").upsert(
      {
        keyword: normalized,
        category: null,
        priority: 65,
        source: "user_low_result",
      },
      { onConflict: "keyword", ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (error) {
    console.warn("[cache] low-result keyword candidate skipped", error);
  }
}

export async function logSearch(
  keyword: string,
  filters: Record<string, unknown>,
  count: number,
  meta: {
    userId?: string;
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
      user_id: meta.userId ?? null,
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
      source: normalizeStoredSource(row.source),
      results,
    };
  } catch (error) {
    console.warn("[cache] niche snapshot skipped", error);
    return null;
  }
}
