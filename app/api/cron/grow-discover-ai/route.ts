import { NextRequest, NextResponse } from "next/server";
import { runAiPatternSlotFiller } from "@/lib/ai-pattern-slot-filler";
import { runAiVerticalStrategist } from "@/lib/ai-vertical-strategist";

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
    safeJob("ai:vertical-strategist", runAiVerticalStrategist),
    safeJob("ai:pattern-slot-filler", runAiPatternSlotFiller),
  ]);

  return NextResponse.json({
    mode: "discover-ai",
    durationMs: Date.now() - startedAt,
    results: Object.fromEntries(results.map((result) => [result.job, result])),
  });
}
