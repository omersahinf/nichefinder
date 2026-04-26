import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

interface ChannelRow {
  youtube_id: string;
  title: string | null;
  subs: number | string | null;
  total_views: number | string | null;
  video_count: number | string | null;
  category: string | null;
  is_monetized: boolean | null;
  trend_growth_30d?: number | string | null;
  avg_views_last_30?: number | string | null;
}

interface VideoRow {
  channel_id: string;
  title: string | null;
  views: number | string | null;
  outlier_score: number | string | null;
  published_at: string | null;
}

interface QualityScore {
  channelId: string;
  qualityScore: number;
  avgOutlierScore: number;
  recentVideoCount: number;
  uploadFrequencyScore: number;
  nicheMatchScore: number;
  monetizationScore: number;
  megaChannelPenalty: number;
  inactivePenalty: number;
  metadata: Record<string, unknown>;
}

const HIGH_VALUE_CATEGORIES = new Set(["finance", "business", "tech", "education", "health"]);

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreChannel(channel: ChannelRow, videos: VideoRow[]): QualityScore {
  const subs = Number(channel.subs ?? 0);
  const avgOutlierScore =
    videos.reduce((sum, video) => sum + Number(video.outlier_score ?? 0), 0) /
    Math.max(videos.length, 1);
  const recentVideoCount = videos.length;
  const uploadFrequencyScore = clamp(recentVideoCount * 1.4, 0, 28);
  const nicheMatchScore = HIGH_VALUE_CATEGORIES.has(channel.category ?? "") ? 16 : 8;
  const monetizationScore = channel.is_monetized ? 16 : subs >= 1_000 ? 10 : 3;
  const megaChannelPenalty = subs > 5_000_000 ? 28 : subs > 1_000_000 ? 18 : 0;
  const inactivePenalty = recentVideoCount === 0 ? 24 : recentVideoCount < 3 ? 12 : 0;
  const trendBonus = clamp(Number(channel.trend_growth_30d ?? 0) / 4, -8, 12);
  const qualityScore = clamp(
    avgOutlierScore * 12 +
      uploadFrequencyScore +
      nicheMatchScore +
      monetizationScore +
      trendBonus -
      megaChannelPenalty -
      inactivePenalty,
    0,
    100,
  );

  return {
    channelId: channel.youtube_id,
    qualityScore,
    avgOutlierScore,
    recentVideoCount,
    uploadFrequencyScore,
    nicheMatchScore,
    monetizationScore,
    megaChannelPenalty,
    inactivePenalty,
    metadata: {
      title: channel.title,
      category: channel.category,
      subs,
      trendGrowth30d: Number(channel.trend_growth_30d ?? 0),
      avgViewsLast30: Number(channel.avg_views_last_30 ?? 0),
      topVideos: videos
        .slice()
        .sort((a, b) => Number(b.outlier_score ?? 0) - Number(a.outlier_score ?? 0))
        .slice(0, 5)
        .map((video) => ({
          title: video.title,
          views: Number(video.views ?? 0),
          outlier: Number(video.outlier_score ?? 0),
        })),
    },
  };
}

export async function runChannelQualityScoring(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "channel-quality",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const { data: channelData, error: channelError } = await client
    .from("channels")
    .select(
      "youtube_id,title,subs,total_views,video_count,category,is_monetized,trend_growth_30d,avg_views_last_30",
    )
    .order("fetched_at", { ascending: false })
    .limit(2_000);
  if (channelError) throw channelError;

  const channels = (channelData ?? []) as ChannelRow[];
  const channelIds = channels.map((channel) => channel.youtube_id);
  if (channelIds.length === 0) {
    await logDiscovery("channel-quality", 0, 0, { skipped: "no_channels" });
    return {
      job: "channel-quality",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "no_channels" },
    };
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: videoData, error: videoError } = await client
    .from("videos")
    .select("channel_id,title,views,outlier_score,published_at")
    .in("channel_id", channelIds)
    .gte("published_at", since)
    .limit(20_000);
  if (videoError) throw videoError;

  const videosByChannel = new Map<string, VideoRow[]>();
  for (const video of (videoData ?? []) as VideoRow[]) {
    const current = videosByChannel.get(video.channel_id) ?? [];
    current.push(video);
    videosByChannel.set(video.channel_id, current);
  }

  const scores = channels.map((channel) => scoreChannel(channel, videosByChannel.get(channel.youtube_id) ?? []));
  const rows = scores.map((score) => ({
    channel_id: score.channelId,
    quality_score: score.qualityScore,
    avg_outlier_score: score.avgOutlierScore,
    recent_video_count: score.recentVideoCount,
    upload_frequency_score: score.uploadFrequencyScore,
    niche_match_score: score.nicheMatchScore,
    monetization_score: score.monetizationScore,
    mega_channel_penalty: score.megaChannelPenalty,
    inactive_penalty: score.inactivePenalty,
    metadata: score.metadata,
    updated_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await client
    .from("channel_quality_scores")
    .upsert(rows, { onConflict: "channel_id" });
  if (upsertError) throw upsertError;

  const topSeedRows = scores
    .filter((score) => score.qualityScore >= 55)
    .sort((a, b) => b.qualityScore - a.qualityScore)
    .slice(0, 75)
    .map((score) => ({
      channel_id: score.channelId,
      added_via: "user_search",
      priority: Math.round(clamp(score.qualityScore, 40, 95)),
    }));

  const { data: promoted, error: seedError } =
    topSeedRows.length > 0
      ? await client
          .from("seed_channels")
          .upsert(topSeedRows, { onConflict: "channel_id", ignoreDuplicates: true })
          .select("channel_id")
      : { data: [], error: null };
  if (seedError) throw seedError;

  await logDiscovery("channel-quality", scores.length, rows.length, {
    videosScanned: (videoData ?? []).length,
    promotedSeeds: (promoted ?? []).length,
    highQualityChannels: topSeedRows.length,
  });

  return {
    job: "channel-quality",
    candidatesFound: scores.length,
    candidatesAdded: rows.length,
    metadata: {
      videosScanned: (videoData ?? []).length,
      promotedSeeds: (promoted ?? []).length,
      highQualityChannels: topSeedRows.length,
    },
  };
}
