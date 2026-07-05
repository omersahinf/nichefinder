import { getSupabaseAdmin } from "@/lib/supabase";
import { findSimilarChannels } from "@/lib/similar";
import { buildOutlierExplanation } from "@/lib/outlier-reasons";
import { formatDurationLabel } from "@/lib/duration";
import type { EnrichedVideo } from "@/lib/search-types";

export const dynamic = "force-dynamic";

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

interface ChannelRow {
  youtube_id: string;
  title: string | null;
  description: string | null;
  subs: number | string | null;
  total_views: number | string | null;
  video_count: number | string | null;
  created_at: string | null;
  category: string | null;
  country: string | null;
  is_monetized: boolean | null;
  thumbnail_url: string | null;
  avg_views_last_30: number | string | null;
  content_class?: string | null;
}

interface VideoRow {
  youtube_id: string;
  title: string | null;
  views: number | string | null;
  outlier_score: number | string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | string | null;
  channel_id: string;
  channel_title: string | null;
  likes: number | string | null;
  comments: number | string | null;
  duration: string | null;
  description: string | null;
  tags: string[] | null;
  outlier_reason: string | null;
  channel_subs?: number;
  channel_avg_views?: number;
  content_class?: string | null;
}

function toEnrichedVideo(row: VideoRow, channel: ChannelRow): EnrichedVideo {
  const subs = Number(channel.subs ?? 0);
  const totalViews = Number(channel.total_views ?? 0);
  const videoCount = Number(channel.video_count ?? 1);
  const channelAvgViews = videoCount > 0 ? totalViews / videoCount : 1;
  return {
    id: row.youtube_id,
    channelId: row.channel_id,
    channelTitle: row.channel_title ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    publishedAt: row.published_at ?? "",
    thumbnail: row.thumbnail_url ?? "",
    tags: row.tags ?? [],
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    duration: row.duration ?? "",
    durationSeconds: Number(row.duration_seconds ?? 0),
    channelSubs: subs,
    channelAvgViews,
    channelTotalViews: totalViews,
    channelVideoCount: videoCount,
    channelCreatedAt: channel.created_at ?? undefined,
    channelCountry: channel.country ?? "",
    channelThumbnail: channel.thumbnail_url ?? "",
    outlierScore: Number(row.outlier_score ?? 0),
    category: channel.category ?? undefined,
    rpmUsd: undefined,
    estimatedRevenueUsd: undefined,
    isMonetized: channel.is_monetized ?? false,
    isShort: false,
    outlierReason: row.outlier_reason ?? "",
  };
}

export default async function ChannelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = getSupabaseAdmin();

  if (!client) {
    return <div className="p-8 text-neutral-400">Database not configured.</div>;
  }

  const readChannel = async (includeContentQuality: boolean) => {
    let query = client
      .from("channels")
      .select(
        includeContentQuality
          ? "youtube_id,title,description,subs,total_views,video_count,created_at,category,country,is_monetized,thumbnail_url,avg_views_last_30,content_class"
          : "youtube_id,title,description,subs,total_views,video_count,created_at,category,country,is_monetized,thumbnail_url,avg_views_last_30",
      )
      .eq("youtube_id", id);
    if (includeContentQuality) query = query.neq("content_class", "junk");
    return query.maybeSingle();
  };
  const readVideos = async (includeContentQuality: boolean) => {
    let query = client
      .from("videos")
      .select(
        includeContentQuality
          ? "youtube_id,title,views,outlier_score,published_at,thumbnail_url,duration_seconds,channel_id,channel_title,likes,comments,duration,description,tags,outlier_reason,content_class"
          : "youtube_id,title,views,outlier_score,published_at,thumbnail_url,duration_seconds,channel_id,channel_title,likes,comments,duration,description,tags,outlier_reason",
      )
      .eq("channel_id", id);
    if (includeContentQuality) query = query.eq("content_class", "niche");
    return query.order("published_at", { ascending: false }).limit(30);
  };
  let [channelRes, videosRes] = await Promise.all([readChannel(true), readVideos(true)]);
  const missingContentColumn = (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    String(error.message).includes("content_class");
  if (missingContentColumn(channelRes.error) || missingContentColumn(videosRes.error)) {
    [channelRes, videosRes] = await Promise.all([readChannel(false), readVideos(false)]);
  }

  const channel = channelRes.data as ChannelRow | null;
  if (!channel) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-2xl text-neutral-700 mb-2">404</div>
          <div className="text-neutral-500">Channel not found in database.</div>
          <a href="/app" className="mt-4 inline-block text-xs text-neutral-400 hover:text-neutral-200 underline">← Back to search</a>
        </div>
      </div>
    );
  }

  const videos = ((videosRes.data ?? []) as unknown as VideoRow[]).map((v) => toEnrichedVideo(v, channel));
  const similarChannels = await findSimilarChannels(id, 8);

  const channelUrl = `https://youtube.com/channel/${id}`;
  const subs = Number(channel.subs ?? 0);
  const totalViews = Number(channel.total_views ?? 0);
  const videoCount = Number(channel.video_count ?? 0);

  // Outlier distribution buckets
  const buckets = [
    { label: "0-1×", count: 0 }, { label: "1-3×", count: 0 }, { label: "3-10×", count: 0 },
    { label: "10-30×", count: 0 }, { label: "30×+", count: 0 },
  ];
  for (const v of videos) {
    if (v.outlierScore < 1) buckets[0].count++;
    else if (v.outlierScore < 3) buckets[1].count++;
    else if (v.outlierScore < 10) buckets[2].count++;
    else if (v.outlierScore < 30) buckets[3].count++;
    else buckets[4].count++;
  }
  const maxBucketCount = Math.max(...buckets.map((b) => b.count), 1);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        {/* Channel header */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
          <div className="flex items-start gap-4">
            {channel.thumbnail_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.thumbnail_url} alt="" className="h-16 w-16 rounded-full flex-shrink-0 object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-full bg-neutral-800 flex items-center justify-center text-2xl font-bold text-neutral-600 flex-shrink-0">
                {(channel.title ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-neutral-100">{channel.title}</h1>
                {channel.country && <span className="text-xs text-neutral-600">{channel.country}</span>}
                {channel.is_monetized && (
                  <span className="rounded border border-amber-700/40 bg-amber-900/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                    Monetized
                  </span>
                )}
              </div>
              {channel.description && (
                <p className="mt-1.5 text-sm text-neutral-500 line-clamp-2">{channel.description}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-neutral-500">
                <span><span className="font-semibold text-neutral-300">{fmt(subs)}</span> subscribers</span>
                <span><span className="font-semibold text-neutral-300">{fmt(totalViews)}</span> total views</span>
                <span><span className="font-semibold text-neutral-300">{videoCount}</span> videos</span>
                {channel.category && <span>Category: <span className="text-neutral-400">{channel.category}</span></span>}
                {channel.created_at && <span>Created {daysAgo(channel.created_at)}</span>}
              </div>
              <a href={channelUrl} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-block rounded border border-red-700/40 bg-red-900/10 px-3 py-1 text-xs font-medium text-red-400 hover:border-red-500 transition-colors">
                View on YouTube →
              </a>
            </div>
          </div>
        </div>

        {/* Outlier distribution */}
        {videos.length > 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-4">Outlier Distribution</h2>
            <div className="flex items-end gap-3">
              {buckets.map((b) => (
                <div key={b.label} className="flex-1 text-center">
                  <div className="mb-1 flex h-20 items-end justify-center">
                    <div
                      className="w-full rounded-t bg-sky-600/60 transition-all"
                      style={{ height: `${Math.max((b.count / maxBucketCount) * 100, b.count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-neutral-500">{b.label}</div>
                  <div className="font-mono text-xs text-neutral-400">{b.count}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last 30 videos */}
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden">
          <div className="border-b border-neutral-800 px-5 py-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Last {videos.length} Videos</h2>
          </div>
          <div className="divide-y divide-neutral-800/60">
            {videos.map((v) => {
              const explanation = buildOutlierExplanation(v);
              return (
                <div key={v.id} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-800/20 transition-colors">
                  <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer"
                    className="relative flex-shrink-0 h-10 w-16 overflow-hidden rounded bg-neutral-800 block">
                    {v.thumbnail && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-0.5 text-[9px] font-mono text-white">
                      {formatDurationLabel(v.durationSeconds ?? 0)}
                    </span>
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer"
                      className="line-clamp-1 text-xs font-medium text-neutral-200 hover:text-red-300 transition-colors">
                      {v.title}
                    </a>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
                      <span className="font-mono">{fmt(v.views)} views</span>
                      <span>·</span>
                      <span>{daysAgo(v.publishedAt)}</span>
                      {explanation.summary && (
                        <span className="text-neutral-600">· {explanation.summary}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-mono font-semibold ${
                      v.outlierScore >= 10 ? "bg-green-500/15 text-green-300"
                      : v.outlierScore >= 3 ? "bg-sky-500/15 text-sky-300"
                      : "bg-neutral-800 text-neutral-500"
                    }`}>
                      {v.outlierScore.toFixed(1)}×
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Similar channels */}
        {similarChannels.length > 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-4">Similar Channels</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {similarChannels.map((c) => (
                <a key={c.channelId} href={`/channel/${c.channelId}`}
                  className="flex items-center gap-2.5 rounded border border-neutral-800 bg-neutral-900/40 p-2.5 hover:border-neutral-700 transition-colors">
                  {c.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.thumbnail} alt="" className="h-8 w-8 rounded-full flex-shrink-0 object-cover" />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-neutral-800 flex-shrink-0 flex items-center justify-center text-xs font-bold text-neutral-600">
                      {c.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-neutral-300">{c.title}</div>
                    <div className="text-[10px] text-neutral-600">{fmt(c.subs)} subs</div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
