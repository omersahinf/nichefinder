import { getSupabaseAdmin } from "./supabase";
import { normalizeKeyword } from "./niche-utils";
import type { EnrichedVideo } from "./search-types";

export const THUMBNAIL_LABEL_OPTIONS = [
  "face",
  "close-up",
  "large text",
  "high contrast",
  "before-after",
  "object focus",
  "bright background",
  "dark background",
  "arrow/circle",
  "emotion",
] as const;

export type ThumbnailLabel = (typeof THUMBNAIL_LABEL_OPTIONS)[number];

export interface ThumbnailPattern {
  id: string;
  normalizedKeyword: string;
  keyword: string;
  videoId: string;
  labels: ThumbnailLabel[];
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThumbnailPatternWithVideo extends ThumbnailPattern {
  video: EnrichedVideo | null;
}

export interface ThumbnailPatternSummary {
  total: number;
  labeled: number;
  labelCounts: Record<ThumbnailLabel, number>;
  topLabels: ThumbnailLabel[];
}

interface ThumbnailPatternRow {
  id: string;
  normalized_keyword: string;
  keyword: string;
  video_id: string;
  labels: string[] | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listThumbnailPatterns(keyword: string): Promise<ThumbnailPattern[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("thumbnail_patterns")
    .select(
      "id,normalized_keyword,keyword,video_id,labels,notes,created_by,created_at,updated_at",
    )
    .eq("normalized_keyword", normalizeKeyword(keyword))
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[thumbnail-patterns] list error", error);
    return [];
  }

  return ((data ?? []) as ThumbnailPatternRow[]).map((row) => ({
    id: row.id,
    normalizedKeyword: row.normalized_keyword,
    keyword: row.keyword,
    videoId: row.video_id,
    labels: (row.labels ?? []) as ThumbnailLabel[],
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function getThumbnailPatternByVideo(
  keyword: string,
  videoId: string,
): Promise<ThumbnailPattern | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data, error } = await client
    .from("thumbnail_patterns")
    .select(
      "id,normalized_keyword,keyword,video_id,labels,notes,created_by,created_at,updated_at",
    )
    .eq("normalized_keyword", normalizeKeyword(keyword))
    .eq("video_id", videoId)
    .maybeSingle();

  if (error) {
    console.warn("[thumbnail-patterns] get by video error", error);
    return null;
  }

  if (!data) return null;

  const row = data as ThumbnailPatternRow;
  return {
    id: row.id,
    normalizedKeyword: row.normalized_keyword,
    keyword: row.keyword,
    videoId: row.video_id,
    labels: (row.labels ?? []) as ThumbnailLabel[],
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertThumbnailPattern(
  keyword: string,
  videoId: string,
  labels: ThumbnailLabel[],
  notes: string | null = null,
  userId: string | null = null,
): Promise<ThumbnailPattern | null> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const normalized = normalizeKeyword(keyword);
  const validLabels = labels.filter((label) =>
    THUMBNAIL_LABEL_OPTIONS.includes(label as ThumbnailLabel),
  );

  const { data, error } = await client
    .from("thumbnail_patterns")
    .upsert(
      {
        normalized_keyword: normalized,
        keyword,
        video_id: videoId,
        labels: validLabels,
        notes,
        created_by: userId,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "normalized_keyword,video_id",
      },
    )
    .select(
      "id,normalized_keyword,keyword,video_id,labels,notes,created_by,created_at,updated_at",
    )
    .maybeSingle();

  if (error) throw error;

  if (!data) return null;

  const row = data as ThumbnailPatternRow;
  return {
    id: row.id,
    normalizedKeyword: row.normalized_keyword,
    keyword: row.keyword,
    videoId: row.video_id,
    labels: (row.labels ?? []) as ThumbnailLabel[],
    notes: row.notes ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function deleteThumbnailPattern(id: string): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const { error } = await client.from("thumbnail_patterns").delete().eq("id", id);

  if (error) throw error;
}

export function computePatternSummary(patterns: ThumbnailPattern[]): ThumbnailPatternSummary {
  const total = patterns.length;
  const labeled = patterns.filter((p) => p.labels.length > 0).length;
  const labelCounts: Record<ThumbnailLabel, number> = {} as Record<ThumbnailLabel, number>;

  for (const label of THUMBNAIL_LABEL_OPTIONS) {
    labelCounts[label] = 0;
  }

  for (const pattern of patterns) {
    for (const label of pattern.labels) {
      if (labelCounts[label] !== undefined) {
        labelCounts[label]++;
      }
    }
  }

  const sortedLabels = Object.entries(labelCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label as ThumbnailLabel);

  return {
    total,
    labeled,
    labelCounts,
    topLabels: sortedLabels.slice(0, 5),
  };
}

export function matchPatternsToVideos(
  videos: EnrichedVideo[],
  patterns: ThumbnailPattern[],
): Array<{ video: EnrichedVideo; pattern: ThumbnailPattern | null }> {
  const patternMap = new Map(patterns.map((p) => [p.videoId, p]));

  return videos.map((video) => ({
    video,
    pattern: patternMap.get(video.id) ?? null,
  }));
}