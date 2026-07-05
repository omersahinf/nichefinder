import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { runChannelQualityScoring } from "@/lib/channel-quality";
import { runGraphCrawler } from "@/lib/graph-crawler";
import { runKeywordExtraction } from "@/lib/keyword-extraction";
import { runKeywordTrends } from "@/lib/keyword-trends";
import { runKeywordVariation } from "@/lib/keyword-variation";
import { runNicheGraphDiscovery } from "@/lib/niche-graph-discovery";
import { runPatternMiner } from "@/lib/pattern-miner";
import { runUploadsDeepScan } from "@/lib/uploads-deep-scan";
import { runVelocityTracker } from "@/lib/velocity-tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type GrowthJobResult = {
  job: string;
  candidatesFound: number;
  candidatesAdded: number;
  metadata: Record<string, unknown>;
  error?: string;
};

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  ) {
    const code = "code" in error ? ` [${(error as Record<string, unknown>).code}]` : "";
    return `${(error as Record<string, unknown>).message as string}${code}`;
  }
  return String(error);
}

async function logJobError(job: string, errorMsg: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;
  await client.from("growth_job_errors").insert({ job, error_msg: errorMsg, metadata });
}

async function safeJob(
  name: string,
  runner: () => Promise<Omit<GrowthJobResult, "error">>,
): Promise<GrowthJobResult> {
  try {
    return await runner();
  } catch (error) {
    const msg = extractErrorMessage(error);
    await logJobError(name, msg);
    console.error(`[grow-discover] ${name} failed:`, msg);
    return {
      job: name,
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { error: msg },
      error: msg,
    };
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const results = await Promise.all([
    safeJob("pattern-miner", runPatternMiner),
    safeJob("velocity-tracker", runVelocityTracker),
    safeJob("keyword-extraction", runKeywordExtraction),
    safeJob("keyword-variation", runKeywordVariation),
    safeJob("keyword-trends", runKeywordTrends),
    safeJob("graph-crawler", runGraphCrawler),
    safeJob("niche-graph-discovery", runNicheGraphDiscovery),
    safeJob("channel-quality", runChannelQualityScoring),
    safeJob("uploads-deep-scan", runUploadsDeepScan),
  ]);

  return NextResponse.json({
    mode: "discover",
    durationMs: Date.now() - startedAt,
    results: Object.fromEntries(results.map((result) => [result.job, result])),
  });
}
