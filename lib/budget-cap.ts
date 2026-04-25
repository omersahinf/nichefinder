import { getSupabaseAdmin } from "./supabase";

const todayKey = (): string => new Date().toISOString().slice(0, 10);

export interface AiBudgetCheck {
  allowed: boolean;
  usedUsd: number;
  capUsd: number;
  reason?: string;
}

export interface AiUsageRecord {
  provider: string;
  model: string;
  job: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}

function numericEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export function estimateAiCostUsd(inputTokens: number, outputTokens: number): number {
  const inputPerMillion = numericEnv("AI_INPUT_USD_PER_1M", 1.2);
  const outputPerMillion = numericEnv("AI_OUTPUT_USD_PER_1M", 6);
  if (process.env.AI_FREE_USAGE === "true") return 0;
  return (inputTokens / 1_000_000) * inputPerMillion + (outputTokens / 1_000_000) * outputPerMillion;
}

export function estimateTheoreticalCostUsd(inputTokens: number, outputTokens: number): number {
  const inputPerMillion = numericEnv("AI_INPUT_USD_PER_1M", 1.2);
  const outputPerMillion = numericEnv("AI_OUTPUT_USD_PER_1M", 6);
  return (
    (inputTokens / 1_000_000) * inputPerMillion +
    (outputTokens / 1_000_000) * outputPerMillion
  );
}

export async function getTodayAiCostUsd(): Promise<number> {
  const client = getSupabaseAdmin();
  if (!client) return 0;

  const { data, error } = await client
    .from("ai_costs")
    .select("cost_usd")
    .eq("day", todayKey());

  if (error) throw error;

  return (data ?? []).reduce(
    (sum, row: { cost_usd: number | string | null }) => sum + Number(row.cost_usd ?? 0),
    0,
  );
}

export async function getTodayShadowCostUsd(): Promise<number> {
  const client = getSupabaseAdmin();
  if (!client) return 0;

  const { data, error } = await client
    .from("ai_costs")
    .select("theoretical_cost_usd")
    .eq("day", todayKey());

  if (error) throw error;

  return (data ?? []).reduce(
    (sum, row: { theoretical_cost_usd: number | string | null }) =>
      sum + Number(row.theoretical_cost_usd ?? 0),
    0,
  );
}

export async function checkAiBudget(estimatedUsd = 0): Promise<AiBudgetCheck> {
  const capUsd = numericEnv("AI_DAILY_USD_CAP", 0.05);
  const client = getSupabaseAdmin();
  if (!client) {
    return { allowed: false, usedUsd: 0, capUsd, reason: "supabase_not_configured" };
  }

  const { data, error } = await client
    .from("ai_costs")
    .select("cost_usd")
    .eq("day", todayKey());

  if (error) throw error;

  const usedUsd = (data ?? []).reduce(
    (sum, row: { cost_usd: number | string | null }) => sum + Number(row.cost_usd ?? 0),
    0,
  );

  if (usedUsd + estimatedUsd > capUsd) {
    return { allowed: false, usedUsd, capUsd, reason: "daily_ai_budget_exceeded" };
  }

  return { allowed: true, usedUsd, capUsd };
}

export async function recordAiUsage(record: AiUsageRecord): Promise<number> {
  const client = getSupabaseAdmin();
  if (!client) return 0;

  const costUsd = estimateAiCostUsd(record.inputTokens, record.outputTokens);
  const theoreticalCostUsd = estimateTheoreticalCostUsd(
    record.inputTokens,
    record.outputTokens,
  );
  const { error } = await client.from("ai_costs").insert({
    day: todayKey(),
    provider: record.provider,
    model: record.model,
    job: record.job,
    input_tokens: record.inputTokens,
    output_tokens: record.outputTokens,
    cost_usd: costUsd,
    theoretical_cost_usd: theoreticalCostUsd,
    metadata: record.metadata ?? {},
  });

  if (error) throw error;
  return costUsd;
}
