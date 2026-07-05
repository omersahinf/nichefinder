import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

const VARIATION_LIMIT = 50;

interface SeedKeywordRow {
  id: string;
  keyword: string;
  source: string | null;
  total_runs: number | string | null;
  total_channels_added: number | string | null;
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

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function variationsFor(keyword: string): string[] {
  const value = normalizeKeyword(keyword);
  return [
    `best ${value} 2026`,
    `${value} tutorial`,
    `${value} explained`,
    `${value} for beginners`,
    `how to ${value}`,
    `${value} tips`,
    `${value} 2026`,
  ];
}

export async function runKeywordVariation(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "variation",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const [{ data: existingRows, error: existingError }, { data: parentRows, error: parentError }] =
    await Promise.all([
      client.from("seed_keywords").select("keyword"),
      client
        .from("seed_keywords")
        .select("id,keyword,source,total_runs,total_channels_added")
        .in("source", ["manual", "extracted"])
        .gte("total_runs", 2),
    ]);

  if (existingError) throw existingError;
  if (parentError) throw parentError;

  const existing = new Set(
    ((existingRows ?? []) as Array<{ keyword: string | null }>).flatMap((row) =>
      row.keyword ? [normalizeKeyword(row.keyword)] : [],
    ),
  );

  const parents = ((parentRows ?? []) as SeedKeywordRow[])
    .map((row) => ({
      ...row,
      yield: Number(row.total_channels_added ?? 0) / Math.max(Number(row.total_runs ?? 0), 1),
    }))
    .sort((a, b) => b.yield - a.yield)
    .slice(0, 30);

  const seen = new Set(existing);
  const rowsToInsert: Array<{
    keyword: string;
    source: string;
    parent_keyword_id: string;
    priority: number;
  }> = [];

  for (const parent of parents) {
    for (const variation of variationsFor(parent.keyword)) {
      const normalized = normalizeKeyword(variation);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      rowsToInsert.push({
        keyword: normalized,
        source: "variation",
        parent_keyword_id: parent.id,
        priority: 40,
      });
      if (rowsToInsert.length >= VARIATION_LIMIT) break;
    }
    if (rowsToInsert.length >= VARIATION_LIMIT) break;
  }

  const { data: inserted, error: insertError } =
    rowsToInsert.length > 0
      ? await client
          .from("seed_keywords")
          .upsert(rowsToInsert, { onConflict: "keyword", ignoreDuplicates: true })
          .select("id")
      : { data: [], error: null };

  if (insertError) throw insertError;

  const candidatesAdded = (inserted ?? []).length;
  await logDiscovery("variation", rowsToInsert.length, candidatesAdded, {
    parentsConsidered: parents.length,
  });

  return {
    job: "variation",
    candidatesFound: rowsToInsert.length,
    candidatesAdded,
    metadata: { parentsConsidered: parents.length },
  };
}
