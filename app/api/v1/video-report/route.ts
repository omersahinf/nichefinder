import { NextRequest, NextResponse } from "next/server";
import { parseChannelIdFromUrl } from "@/lib/youtube-url";
import { searchCachedVideos } from "@/lib/cache";
import { computeSaturation } from "@/lib/saturation";
import { computeNicheDecision } from "@/lib/niche-decision";
import { findSimilarChannels } from "@/lib/similar";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { EnrichedVideo } from "@/lib/search-types";

export const dynamic = "force-dynamic";

interface VideoReportRow {
  youtube_id: string;
  title: string | null;
  views: number | string | null;
  channel_id: string;
  published_at: string | null;
  outlier_score: number | string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  duration_seconds: number | string | null;
  content_class?: string | null;
}

interface ChannelReportRow {
  youtube_id: string;
  title: string | null;
  subs: number | string | null;
  avg_views_last_30: number | string | null;
  category: string | null;
  tags: string[] | null;
  thumbnail_url: string | null;
  created_at: string | null;
  content_class?: string | null;
}

function extractVideoId(input: string): string | null {
  const parsed = parseChannelIdFromUrl(input);
  if (parsed?.startsWith("video:")) return parsed.slice(6);
  return null;
}

async function getVideoFromDb(videoId: string) {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const readVideo = async (includeContentQuality: boolean) => {
    const select = includeContentQuality
      ? "youtube_id,title,views,channel_id,published_at,outlier_score,tags,thumbnail_url,duration_seconds,content_class"
      : "youtube_id,title,views,channel_id,published_at,outlier_score,tags,thumbnail_url,duration_seconds";
    let query = client
      .from("videos")
      .select(select as string)
      .eq("youtube_id", videoId);
    if (includeContentQuality) query = query.eq("content_class", "niche");
    return query.maybeSingle();
  };
  let { data, error } = await readVideo(true);
  if (
    error &&
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    String(error.message).includes("content_class")
  ) {
    const legacy = await readVideo(false);
    data = legacy.data;
    error = legacy.error;
  }

  return (data ?? null) as unknown as VideoReportRow | null;
}

async function getChannelFromDb(channelId: string) {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const readChannel = async (includeContentQuality: boolean) => {
    const select = includeContentQuality
      ? "youtube_id,title,subs,avg_views_last_30,category,tags,thumbnail_url,created_at,content_class"
      : "youtube_id,title,subs,avg_views_last_30,category,tags,thumbnail_url,created_at";
    let query = client
      .from("channels")
      .select(select as string)
      .eq("youtube_id", channelId);
    if (includeContentQuality) query = query.neq("content_class", "junk");
    return query.maybeSingle();
  };
  let { data, error } = await readChannel(true);
  if (
    error &&
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    String(error.message).includes("content_class")
  ) {
    const legacy = await readChannel(false);
    data = legacy.data;
    error = legacy.error;
  }

  return (data ?? null) as unknown as ChannelReportRow | null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = req.nextUrl.searchParams.get("url")?.trim();
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return NextResponse.json(
      { error: "URL is not a recognized YouTube video URL" },
      { status: 400 },
    );
  }

  try {
    const video = await getVideoFromDb(videoId);

    if (!video) {
      return NextResponse.json(
        { error: "Video not found in database. Try searching its niche keyword first." },
        { status: 404 },
      );
    }

    const channelId = video.channel_id as string;
    const [channel, similarChannels] = await Promise.all([
      getChannelFromDb(channelId),
      findSimilarChannels(channelId, 8),
    ]);

    // Get niche context: videos from same channel's niche (use tags as proxy keywords)
    const tags = (video.tags as string[] | null) ?? [];
    const nicheKeyword = tags[0] ?? (channel as { category?: string | null } | null)?.category ?? "";

    let nicheVideos: EnrichedVideo[] = [];
    if (nicheKeyword) {
      const nicheDb = await searchCachedVideos({
        q: nicheKeyword,
        page: 1,
        pageSize: 200,
        sort: "outlier",
      });
      nicheVideos = nicheDb.results;
    }

    const saturation = nicheVideos.length >= 5 ? computeSaturation(nicheVideos) : null;
    const decision = computeNicheDecision(saturation);

    // Top competitor channels (sorted by subs, exclude the target)
    const competitorChannelIds = [
      ...new Set(nicheVideos.map((v) => v.channelId).filter((id) => id !== channelId)),
    ].slice(0, 5);

    return NextResponse.json({
      video: {
        id: videoId,
        title: video.title,
        views: video.views,
        channelId,
        publishedAt: video.published_at,
        outlierScore: video.outlier_score,
        thumbnailUrl: video.thumbnail_url,
        durationSeconds: video.duration_seconds,
      },
      channel: channel
        ? {
            id: channelId,
            title: channel.title,
            subs: channel.subs,
            avgViewsLast30: channel.avg_views_last_30,
            category: channel.category,
            thumbnailUrl: channel.thumbnail_url,
            createdAt: channel.created_at,
          }
        : null,
      nicheKeyword,
      saturation,
      decision,
      similarChannels,
      competitorChannelIds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
