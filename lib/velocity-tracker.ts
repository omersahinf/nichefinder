import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "for",
  "with",
  "and",
  "or",
  "in",
  "on",
  "at",
  "my",
  "your",
  "this",
  "that",
  "is",
  "was",
  "are",
  "how",
  "what",
  "why",
  "best",
  "top",
  "new",
]);

interface VideoVelocityRow {
  youtube_id: string;
  channel_id: string;
  title: string;
  views: number | string | null;
  outlier_score: number | string | null;
  published_at: string | null;
}

interface Cluster {
  term: string;
  videos: VideoVelocityRow[];
  channels: Set<string>;
  viewsPerHour: number;
  recentVideos: number;
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

function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

function viewsPerHour(row: VideoVelocityRow): number {
  const publishedAt = row.published_at ? new Date(row.published_at).getTime() : Date.now();
  const ageHours = Math.max(1, (Date.now() - publishedAt) / 3_600_000);
  return Number(row.views ?? 0) / ageHours;
}

export async function runVelocityTracker(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "velocity-tracker",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const recentCutoff = Date.now() - 72 * 60 * 60 * 1000;
  const { data, error } = await client
    .from("videos")
    .select("youtube_id,channel_id,title,views,outlier_score,published_at")
    .gte("published_at", since)
    .limit(5_000);
  if (error) throw error;

  const clusters = new Map<string, Cluster>();
  for (const row of (data ?? []) as VideoVelocityRow[]) {
    const tokens = tokenize(row.title);
    for (let size = 2; size <= 4; size += 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const term = tokens.slice(index, index + size).join(" ");
        const cluster = clusters.get(term) ?? {
          term,
          videos: [],
          channels: new Set<string>(),
          viewsPerHour: 0,
          recentVideos: 0,
        };
        cluster.videos.push(row);
        cluster.channels.add(row.channel_id);
        cluster.viewsPerHour += viewsPerHour(row);
        if (row.published_at && new Date(row.published_at).getTime() >= recentCutoff) {
          cluster.recentVideos += 1;
        }
        clusters.set(term, cluster);
      }
    }
  }

  const ranked = [...clusters.values()]
    .filter((cluster) => cluster.videos.length >= 3 && cluster.channels.size >= 2)
    .map((cluster) => ({
      ...cluster,
      score:
        cluster.viewsPerHour / Math.max(cluster.videos.length, 1) +
        cluster.channels.size * 25 +
        cluster.recentVideos * 15,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  let added = 0;
  for (const cluster of ranked) {
    const avgOutlier =
      cluster.videos.reduce((sum, row) => sum + Number(row.outlier_score ?? 0), 0) /
      Math.max(cluster.videos.length, 1);
    const { error: upsertError } = await client.from("title_patterns").upsert(
      {
        pattern: cluster.term,
        pattern_type: "velocity_cluster",
        score: cluster.score,
        velocity_score: cluster.viewsPerHour / Math.max(cluster.videos.length, 1),
        video_count: cluster.videos.length,
        channel_count: cluster.channels.size,
        slot_count: 0,
        avg_outlier_score: avgOutlier,
        avg_views_per_hour: cluster.viewsPerHour / Math.max(cluster.videos.length, 1),
        first_seen_at: cluster.videos
          .flatMap((row) => (row.published_at ? [row.published_at] : []))
          .sort()[0],
        last_seen_at: cluster.videos
          .flatMap((row) => (row.published_at ? [row.published_at] : []))
          .sort()
          .at(-1),
        metadata: {
          titles: cluster.videos.slice(0, 10).map((row) => row.title),
          recentVideos: cluster.recentVideos,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pattern" },
    );
    if (upsertError) throw upsertError;
    added += 1;
  }

  await logDiscovery("velocity-tracker", ranked.length, added, {
    videosScanned: (data ?? []).length,
  });

  return {
    job: "velocity-tracker",
    candidatesFound: ranked.length,
    candidatesAdded: added,
    metadata: { videosScanned: (data ?? []).length },
  };
}
