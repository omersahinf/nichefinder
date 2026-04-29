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
  thumbnail_url: string | null;
  fetched_at: string | null;
  trend_growth_30d: number | string | null;
  trend_direction: string | null;
  trend_sample_size: number | string | null;
  avg_views_last_30: number | string | null;
  is_monetized: boolean | null;
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

  const channelId = req.nextUrl.searchParams.get("id") || req.nextUrl.searchParams.get("channelId");
  if (!channelId) {
    return NextResponse.json({ error: "Channel ID required (id or channelId parameter)" }, { status: 400 });
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  try {
    let query = client
      .from("channels")
      .select("*")
      .eq("youtube_id", channelId);

    if (channelId.startsWith("@")) {
      query = client
        .from("channels")
        .select("*")
        .ilike("title", channelId.slice(1));
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({ error: "Channel not found in cache" }, { status: 404 });
    }

    const channel = data as ChannelRow;

    return NextResponse.json({
      id: channel.youtube_id,
      channelId: channel.youtube_id,
      title: channel.title,
      description: channel.description,
      subs: Number(channel.subs ?? 0),
      totalViews: Number(channel.total_views ?? 0),
      videoCount: Number(channel.video_count ?? 0),
      country: channel.country,
      createdAt: channel.created_at,
      category: channel.category,
      thumbnail: channel.thumbnail_url,
      isMonetized: channel.is_monetized,
      trend: channel.trend_direction
        ? {
            growth30d: Number(channel.trend_growth_30d ?? 0),
            direction: channel.trend_direction,
            sampleSize: Number(channel.trend_sample_size ?? 0),
            avgViewsLast30: Number(channel.avg_views_last_30 ?? 0),
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Channel lookup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}