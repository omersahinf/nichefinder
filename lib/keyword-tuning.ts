import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

interface SeedKeywordRow {
  id: string;
  priority: number | string | null;
  total_runs: number | string | null;
  total_channels_added: number | string | null;
  expires_at: string | null;
  enabled: boolean | null;
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

function yieldFor(row: SeedKeywordRow): number {
  return Number(row.total_channels_added ?? 0) / Math.max(Number(row.total_runs ?? 0), 1);
}

export async function runKeywordTuning(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "tuning",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const { data, error } = await client
    .from("seed_keywords")
    .select("id,priority,total_runs,total_channels_added,expires_at,enabled");
  if (error) throw error;

  const rows = (data ?? []) as SeedKeywordRow[];
  const eligible = rows
    .filter((row) => Number(row.total_runs ?? 0) >= 5)
    .sort((a, b) => yieldFor(b) - yieldFor(a));
  const bucketSize = eligible.length >= 10 ? Math.max(1, Math.floor(eligible.length * 0.1)) : 0;
  const topIds = new Set(eligible.slice(0, bucketSize).map((row) => row.id));
  const bottomRows = eligible
    .slice(Math.max(0, eligible.length - bucketSize))
    .filter((row) => !topIds.has(row.id));
  const expiredRows = rows.filter(
    (row) => row.expires_at && new Date(row.expires_at).getTime() < Date.now() && row.enabled,
  );
  const noYieldRows = rows.filter(
    (row) =>
      Number(row.total_runs ?? 0) >= 10 &&
      Number(row.total_channels_added ?? 0) === 0 &&
      row.enabled,
  );

  let updates = 0;

  for (const row of eligible.slice(0, bucketSize)) {
    const priority = Math.min(Number(row.priority ?? 50) + 10, 100);
    const { error: updateError } = await client
      .from("seed_keywords")
      .update({ priority })
      .eq("id", row.id);
    if (updateError) throw updateError;
    updates += 1;
  }

  for (const row of bottomRows) {
    const priority = Math.max(Number(row.priority ?? 50) - 10, 0);
    const { error: updateError } = await client
      .from("seed_keywords")
      .update({ priority })
      .eq("id", row.id);
    if (updateError) throw updateError;
    updates += 1;
  }

  const disableIds = [...new Set([...expiredRows, ...noYieldRows].map((row) => row.id))];
  if (disableIds.length > 0) {
    const { error: disableError } = await client
      .from("seed_keywords")
      .update({ enabled: false })
      .in("id", disableIds);
    if (disableError) throw disableError;
    updates += disableIds.length;
  }

  await logDiscovery("tuning", eligible.length, updates, {
    promoted: bucketSize,
    demoted: bottomRows.length,
    disabledExpired: expiredRows.length,
    disabledNoYield: noYieldRows.length,
  });

  return {
    job: "tuning",
    candidatesFound: eligible.length,
    candidatesAdded: updates,
    metadata: {
      promoted: bucketSize,
      demoted: bottomRows.length,
      disabledExpired: expiredRows.length,
      disabledNoYield: noYieldRows.length,
    },
  };
}
