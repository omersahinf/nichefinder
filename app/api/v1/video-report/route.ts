import { NextRequest, NextResponse } from "next/server";
import { parseChannelIdFromUrl } from "@/lib/youtube-url";
import { searchCachedVideos } from "@/lib/cache";
import { computeSaturation } from "@/lib/saturation";
import { computeNicheDecision } from "@/lib/niche-decision";
import { findSimilarChannels } from "@/lib/similar";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function extractVideoId(input: string): string | null {
  const parsed = parseChannelIdFromUrl(input);
  if (parsed?.startsWith("video:")) return parsed.slice(6);
  return null;
}

async function getVideoFromDb(videoId: string) {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data } = await client
    .from("videos")
    .select(
      "youtube_id,title,views,channel_id,published_at,outlier_score,tags,thumbnail_url,duration_seconds",
    )
    .eq("youtube_id", videoId)
    .maybeSingle();

  return data ?? null;
}

async function getChannelFromDb(channelId: string) {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data } = await client
    .from("channels")
    .select("youtube_id,title,subs,avg_views_last_30,category,tags,thumbnail_url,created_at")
    .eq("youtube_id", channelId)
    .maybeSingle();

  return data ?? null;
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
    const [video, dbPage] = await Promise.all([
      getVideoFromDb(videoId),
      searchCachedVideos({ q: undefined, page: 1, pageSize: 200, sort: "outlier" }),
    ]);

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

    let nicheVideos: Awaited<typeof dbPage>["results"] = [];
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
