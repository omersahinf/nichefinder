import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { runAiPatternSlotFiller } from "@/lib/ai-pattern-slot-filler";
import { runAiVerticalStrategist } from "@/lib/ai-vertical-strategist";
import { getTodayAiCostUsd, getTodayShadowCostUsd } from "@/lib/budget-cap";
import { runGraphCrawler } from "@/lib/graph-crawler";
import { runKeywordExtraction } from "@/lib/keyword-extraction";
import { runKeywordTrends } from "@/lib/keyword-trends";
import { runKeywordTuning } from "@/lib/keyword-tuning";
import { runKeywordVariation } from "@/lib/keyword-variation";
import { runPatternMiner } from "@/lib/pattern-miner";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runVelocityTracker } from "@/lib/velocity-tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type GrowthJob =
  | "pattern"
  | "velocity"
  | "extract"
  | "vary"
  | "trend"
  | "graph"
  | "ai_vertical"
  | "ai_slot"
  | "tune";

type GrowthJobResult = {
  job: string;
  candidatesFound: number;
  candidatesAdded: number;
  metadata: Record<string, unknown>;
  error?: string;
};

const DEFAULT_DISCOVER_JOBS: GrowthJob[] = [
  "pattern",
  "velocity",
  "extract",
  "vary",
  "trend",
  "graph",
  "ai_vertical",
  "ai_slot",
];

async function safeJob(
  name: string,
  runner: () => Promise<Omit<GrowthJobResult, "error">>,
): Promise<GrowthJobResult> {
  try {
    return await runner();
  } catch (error) {
    return {
      job: name,
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: {},
      error: error instanceof Error ? error.message : "Job failed",
    };
  }
}

function parseJobs(value: unknown, mode: "discover" | "tune"): GrowthJob[] {
  if (mode === "tune") return ["tune"];
  if (!Array.isArray(value)) return DEFAULT_DISCOVER_JOBS;
  const allowed = new Set<GrowthJob>([...DEFAULT_DISCOVER_JOBS, "tune"]);
  const jobs = value.filter((job): job is GrowthJob => allowed.has(job));
  return jobs.length > 0 ? jobs : DEFAULT_DISCOVER_JOBS;
}

function runnerFor(job: GrowthJob): [string, () => Promise<Omit<GrowthJobResult, "error">>] {
  if (job === "pattern") return ["pattern-miner", runPatternMiner];
  if (job === "velocity") return ["velocity-tracker", runVelocityTracker];
  if (job === "extract") return ["keyword-extraction", runKeywordExtraction];
  if (job === "vary") return ["keyword-variation", runKeywordVariation];
  if (job === "trend") return ["keyword-trends", runKeywordTrends];
  if (job === "graph") return ["graph-crawler", runGraphCrawler];
  if (job === "ai_vertical") return ["ai:vertical-strategist", runAiVerticalStrategist];
  if (job === "ai_slot") return ["ai:pattern-slot-filler", runAiPatternSlotFiller];
  return ["keyword-tuning", runKeywordTuning];
}

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const [{ data, error }, todayAiCostUsd, todayAiShadowCostUsd] = await Promise.all([
      client
        .from("title_patterns")
        .select(
          "id,pattern,pattern_type,score,velocity_score,video_count,channel_count,slot_count,last_seen_at,metadata",
        )
        .order("score", { ascending: false })
        .limit(25),
      getTodayAiCostUsd(),
      getTodayShadowCostUsd(),
    ]);
    if (error) throw error;
    return NextResponse.json({
      patterns: data ?? [],
      today_ai_cost_usd: todayAiCostUsd,
      today_ai_shadow_cost_usd: todayAiShadowCostUsd,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load patterns";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  const startedAt = Date.now();
  const body = (await req.json().catch(() => ({}))) as {
    mode?: "discover" | "tune";
    jobs?: unknown;
  };
  const mode = body.mode === "tune" ? "tune" : "discover";
  const jobs = parseJobs(body.jobs, mode);

  const results = await Promise.all(
    jobs.map((job) => {
      const [name, runner] = runnerFor(job);
      return safeJob(name, runner);
    }),
  );

  return NextResponse.json({
    mode,
    durationMs: Date.now() - startedAt,
    results: Object.fromEntries(results.map((result) => [result.job, result])),
  });
}
