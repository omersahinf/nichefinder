import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateApiKey } from "@/lib/api-keys";
import { enforceQuota } from "@/lib/billing";

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export const dynamic = "force-dynamic";

interface VideoRow {
  youtube_id: string;
  channel_id: string;
  channel_title: string | null;
  title: string;
  views: number | string | null;
  likes: number | string | null;
  comments: number | string | null;
  duration: string | null;
  published_at: string;
  thumbnail_url: string | null;
  outlier_score: number | string | null;
  outlier_reason: string | null;
  content_class?: string | null;
}

interface ChannelRow {
  youtube_id: string;
  title: string;
  subs: number | string | null;
  total_views: number | string | null;
  video_count: number | string | null;
  thumbnail_url: string | null;
  content_class?: string | null;
}

function isMissingContentQualityColumn(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    String(error.message).includes("content_class")
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  }

  const key = await validateApiKey(token);
  if (!key) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const apiAccess = await enforceQuota(key.userId, "api_access");
  if (!apiAccess.allowed) {
    return NextResponse.json({ error: apiAccess.reason ?? "API access requires Pro" }, { status: 403 });
  }

  const videoId = req.nextUrl.searchParams.get("id") || req.nextUrl.searchParams.get("videoId");
  if (!videoId) {
    return NextResponse.json({ error: "Video ID required (id or videoId parameter)" }, { status: 400 });
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    const readVideo = async (includeContentQuality: boolean) => {
      let query = client
        .from("videos")
        .select(
          includeContentQuality
            ? "youtube_id,channel_id,channel_title,title,views,likes,comments,duration,published_at,thumbnail_url,outlier_score,outlier_reason,content_class"
            : "youtube_id,channel_id,channel_title,title,views,likes,comments,duration,published_at,thumbnail_url,outlier_score,outlier_reason",
        )
        .eq("youtube_id", videoId);
      if (includeContentQuality) query = query.eq("content_class", "niche");
      return query.maybeSingle();
    };
    let { data: videoData, error: videoError } = await readVideo(true);
    if (videoError && isMissingContentQualityColumn(videoError)) {
      const legacy = await readVideo(false);
      videoData = legacy.data;
      videoError = legacy.error;
    }

    if (videoError) throw videoError;

    if (!videoData) {
      return NextResponse.json({ error: "Video not found in cache" }, { status: 404 });
    }

    const video = videoData as unknown as VideoRow;

    const readChannel = async (includeContentQuality: boolean) => {
      let query = client
        .from("channels")
        .select(
          includeContentQuality
            ? "youtube_id,title,subs,total_views,video_count,thumbnail_url,content_class"
            : "youtube_id,title,subs,total_views,video_count,thumbnail_url",
        )
        .eq("youtube_id", video.channel_id);
      if (includeContentQuality) query = query.neq("content_class", "junk");
      return query.maybeSingle();
    };
    let { data: channelData, error: channelError } = await readChannel(true);
    if (channelError && isMissingContentQualityColumn(channelError)) {
      const legacy = await readChannel(false);
      channelData = legacy.data;
      channelError = legacy.error;
    }

    if (channelError) throw channelError;

    const channel = channelData as ChannelRow | null;

    return NextResponse.json({
      id: video.youtube_id,
      videoId: video.youtube_id,
      channelId: video.channel_id,
      channelTitle: video.channel_title || channel?.title || null,
      title: video.title,
      views: Number(video.views ?? 0),
      likes: Number(video.likes ?? 0),
      comments: Number(video.comments ?? 0),
      duration: video.duration,
      publishedAt: video.published_at,
      thumbnail: video.thumbnail_url,
      outlierScore: Number(video.outlier_score ?? 0),
      outlierReason: video.outlier_reason,
      channel: channel
        ? {
            id: channel.youtube_id,
            title: channel.title,
            subs: Number(channel.subs ?? 0),
            totalViews: Number(channel.total_views ?? 0),
            videoCount: Number(channel.video_count ?? 0),
            thumbnail: channel.thumbnail_url,
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Video lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
