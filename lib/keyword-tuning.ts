import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

interface SeedKeywordRow {
  id: string;
  keyword?: string;
  priority: number | string | null;
  total_runs: number | string | null;
  total_channels_added: number | string | null;
  expires_at: string | null;
  enabled: boolean | null;
}

export interface TuningPreviewRow {
  id: string;
  keyword: string;
  currentPriority: number;
  newPriority: number;
  action: "promote" | "demote" | "disable_expired" | "disable_no_yield";
  totalRuns: number;
  totalAdded: number;
  yield: number;
}

export interface TuningPreview {
  rows: TuningPreviewRow[];
  eligibleCount: number;
  tooFewRunsCount: number;
  bucketSize: number;
}

export async function previewKeywordTuning(): Promise<TuningPreview | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data, error } = await client
    .from("seed_keywords")
    .select("id,keyword,priority,total_runs,total_channels_added,expires_at,enabled");
  if (error) throw error;

  const rows = (data ?? []) as SeedKeywordRow[];
  const MIN_RUNS = 2;
  const tooFewRunsCount = rows.filter((r) => Number(r.total_runs ?? 0) < MIN_RUNS).length;
  const eligible = rows
    .filter((row) => Number(row.total_runs ?? 0) >= MIN_RUNS)
    .sort((a, b) => yieldFor(b) - yieldFor(a));
  const bucketSize = eligible.length >= 10 ? Math.max(1, Math.floor(eligible.length * 0.1)) : 0;
  const topIds = new Set(eligible.slice(0, bucketSize).map((r) => r.id));
  const bottomRows = eligible
    .slice(Math.max(0, eligible.length - bucketSize))
    .filter((r) => !topIds.has(r.id));
  const expiredRows = rows.filter(
    (r) => r.expires_at && new Date(r.expires_at).getTime() < Date.now() && r.enabled,
  );
  const noYieldRows = rows.filter(
    (r) => Number(r.total_runs ?? 0) >= 10 && Number(r.total_channels_added ?? 0) === 0 && r.enabled,
  );

  const preview: TuningPreviewRow[] = [
    ...eligible.slice(0, bucketSize).map((r) => ({
      id: r.id,
      keyword: r.keyword ?? "",
      currentPriority: Number(r.priority ?? 50),
      newPriority: Math.min(Number(r.priority ?? 50) + 10, 100),
      action: "promote" as const,
      totalRuns: Number(r.total_runs ?? 0),
      totalAdded: Number(r.total_channels_added ?? 0),
      yield: yieldFor(r),
    })),
    ...bottomRows.map((r) => ({
      id: r.id,
      keyword: r.keyword ?? "",
      currentPriority: Number(r.priority ?? 50),
      newPriority: Math.max(Number(r.priority ?? 50) - 10, 0),
      action: "demote" as const,
      totalRuns: Number(r.total_runs ?? 0),
      totalAdded: Number(r.total_channels_added ?? 0),
      yield: yieldFor(r),
    })),
    ...expiredRows.map((r) => ({
      id: r.id,
      keyword: r.keyword ?? "",
      currentPriority: Number(r.priority ?? 50),
      newPriority: Number(r.priority ?? 50),
      action: "disable_expired" as const,
      totalRuns: Number(r.total_runs ?? 0),
      totalAdded: Number(r.total_channels_added ?? 0),
      yield: yieldFor(r),
    })),
    ...noYieldRows.map((r) => ({
      id: r.id,
      keyword: r.keyword ?? "",
      currentPriority: Number(r.priority ?? 50),
      newPriority: Number(r.priority ?? 50),
      action: "disable_no_yield" as const,
      totalRuns: Number(r.total_runs ?? 0),
      totalAdded: Number(r.total_channels_added ?? 0),
      yield: yieldFor(r),
    })),
  ];

  return { rows: preview, eligibleCount: eligible.length, tooFewRunsCount, bucketSize };
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

  const MIN_RUNS_TUNE = 2;
  const MIN_RUNS_DISABLE = 5;
  const rows = (data ?? []) as SeedKeywordRow[];
  const eligible = rows
    .filter((row) => Number(row.total_runs ?? 0) >= MIN_RUNS_TUNE)
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
      Number(row.total_runs ?? 0) >= MIN_RUNS_DISABLE &&
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
