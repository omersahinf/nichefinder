import {
  getExistingVideoIds,
  getTodayQuotaUsage,
  listSeedChannels,
  recordApiUsage,
  upsertVideos,
  youtubeBatchUnits,
  type SeedChannel,
} from "./cache";
import { parseIsoDurationToSeconds } from "./duration";
import { estimateMonetized } from "./monetization";
import { getOutlierReason } from "./outlier-reasons";
import { classifyVideoCategory, estimateRevenue } from "./rpm";
import type { EnrichedVideo } from "./search-types";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { hasShortsSignal } from "./video-format";
import { getVideoStats, type VideoStats } from "./youtube";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const QUOTA_BUFFER_UNITS = 200;

interface PlaylistItem {
  contentDetails?: {
    videoId?: string;
    videoPublishedAt?: string;
  };
  snippet?: {
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

interface PlaylistResponse {
  items?: PlaylistItem[];
  error?: {
    message?: string;
  };
}

interface DeepScanRow {
  channel_id: string;
  last_scanned_at: string | null;
}

interface VideoRef {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
}

async function logDiscovery(
  job: string,
  candidatesFound: number,
  candidatesAdded: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  const { error } = await client.from("keyword_discovery_log").insert({
    job,
    candidates_found: candidatesFound,
    candidates_added: candidatesAdded,
    metadata,
  });
  if (error) throw error;
}

function uploadsPlaylistId(channelId: string): string | null {
  if (!channelId.startsWith("UC")) return null;
  return `UU${channelId.slice(2)}`;
}

async function hasQuotaFor(units: number): Promise<boolean> {
  const quota = await getTodayQuotaUsage();
  return quota.used + units + QUOTA_BUFFER_UNITS <= quota.guardAt;
}

async function fetchUploads(channelId: string, maxResults: number): Promise<VideoRef[]> {
  const playlistId = uploadsPlaylistId(channelId);
  const key = process.env.YOUTUBE_API_KEY;
  if (!playlistId || !key) return [];

  const params = new URLSearchParams({
    key,
    part: "snippet,contentDetails",
    playlistId,
    maxResults: String(maxResults),
  });

  const response = await fetch(`${API_BASE}/playlistItems?${params}`, {
    next: { revalidate: 300 },
  });
  const data = (await response.json()) as PlaylistResponse;
  if (!response.ok) {
    const detail = data.error?.message ? ` - ${data.error.message}` : "";
    throw new Error(`YouTube playlistItems failed: ${response.status}${detail}`);
  }

  return (data.items ?? []).flatMap((item): VideoRef[] => {
    const videoId = item.contentDetails?.videoId;
    const title = item.snippet?.title;
    const publishedAt = item.contentDetails?.videoPublishedAt ?? item.snippet?.publishedAt;
    if (!videoId || !title || !publishedAt || title === "Private video") return [];

    return [
      {
        videoId,
        channelId,
        channelTitle: "",
        title,
        description: item.snippet?.description ?? "",
        publishedAt,
        thumbnail: item.snippet?.thumbnails?.medium?.url ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      },
    ];
  });
}

function buildVideo(ref: VideoRef, stat: VideoStats, seed: SeedChannel): EnrichedVideo {
  const channelAvgViews =
    seed.videoCount > 0 ? seed.totalViews / seed.videoCount : Math.max(stat.views, 1);
  const outlierScore = channelAvgViews > 0 ? stat.views / channelAvgViews : 0;
  const categoryMatch = classifyVideoCategory(ref.title, stat.tags ?? [], ref.description);
  const revenue = estimateRevenue(stat.views, categoryMatch.category);
  const isMonetized = estimateMonetized({
    subs: seed.subs,
    videoCount: seed.videoCount,
    createdAt: seed.createdAt,
  });
  const video = {
    id: ref.videoId,
    channelId: ref.channelId,
    channelTitle: seed.title || ref.channelTitle,
    title: ref.title,
    description: ref.description,
    publishedAt: ref.publishedAt,
    thumbnail: ref.thumbnail,
    tags: stat.tags ?? [],
    views: stat.views,
    likes: stat.likes,
    comments: stat.comments,
    duration: stat.duration,
    durationSeconds: parseIsoDurationToSeconds(stat.duration),
    channelSubs: seed.subs,
    channelAvgViews,
    channelTotalViews: seed.totalViews,
    channelVideoCount: seed.videoCount,
    channelCreatedAt: seed.createdAt,
    channelCountry: seed.country,
    channelThumbnail: seed.thumbnail,
    outlierScore,
    category: revenue.category,
    rpmUsd: revenue.rpmUsd,
    estimatedRevenueUsd: revenue.estimatedRevenueUsd,
    isMonetized,
    isShort: hasShortsSignal({
      title: ref.title,
      description: ref.description,
      tags: stat.tags ?? [],
    }),
  };

  return {
    ...video,
    outlierReason: getOutlierReason(video),
  };
}

async function selectScanSeeds(maxChannels: number): Promise<SeedChannel[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const seeds = await listSeedChannels(Math.max(maxChannels * 6, maxChannels));
  const seedIds = seeds.map((seed) => seed.channelId);
  if (seedIds.length === 0) return [];

  const { data, error } = await client
    .from("channel_deep_scans")
    .select("channel_id,last_scanned_at")
    .in("channel_id", seedIds);
  if (error) throw error;

  const scans = new Map(
    ((data ?? []) as DeepScanRow[]).map((row) => [row.channel_id, row.last_scanned_at]),
  );
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  return seeds
    .filter((seed) => {
      const scannedAt = scans.get(seed.channelId);
      return !scannedAt || new Date(scannedAt).getTime() < sevenDaysAgo;
    })
    .sort((a, b) => {
      const aScan = scans.get(a.channelId);
      const bScan = scans.get(b.channelId);
      if (!aScan && bScan) return -1;
      if (aScan && !bScan) return 1;
      return (aScan ?? "").localeCompare(bScan ?? "");
    })
    .slice(0, maxChannels);
}

export async function runUploadsDeepScan({
  maxChannels = 8,
  maxVideosPerChannel = 30,
}: {
  maxChannels?: number;
  maxVideosPerChannel?: number;
} = {}): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "uploads-deep-scan",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }
  if (!process.env.YOUTUBE_API_KEY) {
    await logDiscovery("uploads-deep-scan", 0, 0, { skipped: "youtube_api_key_missing" });
    return {
      job: "uploads-deep-scan",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "youtube_api_key_missing" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const seeds = await selectScanSeeds(maxChannels);
  let channelsScanned = 0;
  let videosSeen = 0;
  let newVideosAdded = 0;
  let unitsUsed = 0;
  let stoppedReason = "completed";

  for (const seed of seeds) {
    if (!(await hasQuotaFor(1))) {
      stoppedReason = "quota_guard";
      break;
    }

    const refs = await fetchUploads(seed.channelId, maxVideosPerChannel);
    unitsUsed += 1;
    videosSeen += refs.length;
    channelsScanned += 1;

    const existing = await getExistingVideoIds(refs.map((ref) => ref.videoId));
    const newRefs = refs.filter((ref) => !existing.has(ref.videoId));
    const newIds = newRefs.map((ref) => ref.videoId);
    const statUnits = youtubeBatchUnits(newIds.length);
    if (newIds.length > 0 && !(await hasQuotaFor(statUnits))) {
      stoppedReason = "quota_guard";
      break;
    }

    const stats = await getVideoStats(newIds);
    unitsUsed += statUnits;
    const statsById = new Map(stats.map((stat) => [stat.id, stat]));
    const videos = newRefs.flatMap((ref): EnrichedVideo[] => {
      const stat = statsById.get(ref.videoId);
      return stat ? [buildVideo(ref, stat, seed)] : [];
    });

    await upsertVideos(videos);
    newVideosAdded += videos.length;

    const { error: scanError } = await client.from("channel_deep_scans").upsert(
      {
        channel_id: seed.channelId,
        last_scanned_at: new Date().toISOString(),
        videos_seen: refs.length,
        new_videos_added: videos.length,
        quota_units: 1 + statUnits,
        metadata: { channelTitle: seed.title },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "channel_id" },
    );
    if (scanError) throw new Error(`channel_deep_scans upsert failed for ${seed.channelId}: ${scanError.message}`);
  }

  await recordApiUsage(
    unitsUsed,
    {
      job: "uploads-deep-scan",
      channelsScanned,
      videosSeen,
      newVideosAdded,
      stoppedReason,
    },
    "uploads_deep_scan",
  );
  await logDiscovery("uploads-deep-scan", videosSeen, newVideosAdded, {
    channelsScanned,
    unitsUsed,
    stoppedReason,
  });

  return {
    job: "uploads-deep-scan",
    candidatesFound: videosSeen,
    candidatesAdded: newVideosAdded,
    metadata: {
      channelsScanned,
      unitsUsed,
      stoppedReason,
    },
  };
}
