import { getSupabaseAdmin } from "./supabase";

export interface SimilarChannel {
  channelId: string;
  similarity: number;
  title: string;
  subs: number;
  thumbnail: string;
}

interface SimilarChannelRow {
  youtube_id: string;
  title: string;
  subs: number | string | null;
  thumbnail_url: string | null;
  tags: string[] | null;
  content_class?: string | null;
}

const normalizeTags = (tags: string[]): string[] =>
  [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];

export function jaccard(a: string[], b: string[]): number {
  const left = new Set(normalizeTags(a));
  const right = new Set(normalizeTags(b));
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const tag of left) {
    if (right.has(tag)) intersection += 1;
  }

  const union = new Set([...left, ...right]).size;
  return union > 0 ? intersection / union : 0;
}

export async function findSimilarChannels(
  channelId: string,
  limit = 10,
): Promise<SimilarChannel[]> {
  const client = getSupabaseAdmin();
  if (!client || !channelId) return [];

  try {
    const missingContentQualityColumn = (error: unknown) =>
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      String(error.message).includes("content_class");

    const readTarget = async (includeContentQuality: boolean) => {
      let query = client
        .from("channels")
        .select(includeContentQuality ? "youtube_id,tags,content_class" : "youtube_id,tags")
        .eq("youtube_id", channelId);
      if (includeContentQuality) query = query.neq("content_class", "junk");
      return query.maybeSingle();
    };
    let { data: targetData, error: targetError } = await readTarget(true);
    if (targetError && missingContentQualityColumn(targetError)) {
      const legacy = await readTarget(false);
      targetData = legacy.data;
      targetError = legacy.error;
    }

    if (targetError) throw targetError;

    const targetTags = normalizeTags(((targetData as { tags?: string[] } | null)?.tags) ?? []);
    if (targetTags.length === 0) return [];

    const readCandidates = async (includeContentQuality: boolean) => {
      let query = client
        .from("channels")
        .select(
          includeContentQuality
            ? "youtube_id,title,subs,thumbnail_url,tags,content_class"
            : "youtube_id,title,subs,thumbnail_url,tags",
        )
        .neq("youtube_id", channelId);
      if (includeContentQuality) query = query.neq("content_class", "junk");
      return query.overlaps("tags", targetTags).limit(200);
    };
    let { data, error } = await readCandidates(true);
    if (error && missingContentQualityColumn(error)) {
      const legacy = await readCandidates(false);
      data = legacy.data;
      error = legacy.error;
    }

    if (error) throw error;

    return ((data ?? []) as unknown as SimilarChannelRow[])
      .map((row) => ({
        channelId: row.youtube_id,
        similarity: jaccard(targetTags, row.tags ?? []),
        title: row.title,
        subs: Number(row.subs ?? 0),
        thumbnail: row.thumbnail_url ?? "",
      }))
      .filter((channel) => channel.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  } catch (error) {
    console.warn("[similar] lookup skipped", error);
    return [];
  }
}
