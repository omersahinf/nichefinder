import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { runKeywordExtraction } from "@/lib/keyword-extraction";
import { runKeywordTrends } from "@/lib/keyword-trends";
import { runKeywordTuning } from "@/lib/keyword-tuning";
import { runKeywordVariation } from "@/lib/keyword-variation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type DiscoveryJob = "extract" | "vary" | "trend" | "tune";

const DEFAULT_JOBS: DiscoveryJob[] = ["extract", "vary", "trend", "tune"];

function parseJobs(value: unknown): DiscoveryJob[] {
  if (!Array.isArray(value)) return DEFAULT_JOBS;
  const allowed = new Set<DiscoveryJob>(["extract", "vary", "trend", "tune"]);
  const jobs = value.filter((job): job is DiscoveryJob => allowed.has(job));
  return jobs.length > 0 ? jobs : DEFAULT_JOBS;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  try {
    const body = (await req.json().catch(() => ({}))) as { jobs?: unknown };
    const results: Record<string, unknown> = {};

    for (const job of parseJobs(body.jobs)) {
      if (job === "extract") results.extract = await runKeywordExtraction();
      if (job === "vary") results.vary = await runKeywordVariation();
      if (job === "trend") results.trend = await runKeywordTrends();
      if (job === "tune") results.tune = await runKeywordTuning();
    }

    return NextResponse.json({ results });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run keyword discovery";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
