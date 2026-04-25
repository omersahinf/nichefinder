import { NextRequest, NextResponse } from "next/server";
import { runAiPatternSlotFiller } from "@/lib/ai-pattern-slot-filler";
import { runAiVerticalStrategist } from "@/lib/ai-vertical-strategist";
import { runGraphCrawler } from "@/lib/graph-crawler";
import { runKeywordExtraction } from "@/lib/keyword-extraction";
import { runKeywordTrends } from "@/lib/keyword-trends";
import { runKeywordVariation } from "@/lib/keyword-variation";
import { runPatternMiner } from "@/lib/pattern-miner";
import { runVelocityTracker } from "@/lib/velocity-tracker";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
    safeJob("ai:vertical-strategist", runAiVerticalStrategist),
    safeJob("ai:pattern-slot-filler", runAiPatternSlotFiller),
  ]);

  return NextResponse.json({
    mode: "discover",
    durationMs: Date.now() - startedAt,
    results: Object.fromEntries(results.map((result) => [result.job, result])),
  });
}
