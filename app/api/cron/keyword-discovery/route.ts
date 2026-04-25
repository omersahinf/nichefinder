import { NextRequest, NextResponse } from "next/server";
import { runKeywordExtraction } from "@/lib/keyword-extraction";
import { runKeywordTrends } from "@/lib/keyword-trends";
import { runKeywordTuning } from "@/lib/keyword-tuning";
import { runKeywordVariation } from "@/lib/keyword-variation";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const extraction = await runKeywordExtraction();
    const variation = await runKeywordVariation();
    const trend = await runKeywordTrends();
    const tuning = await runKeywordTuning();
    return NextResponse.json({ extraction, variation, trend, tuning });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to run keyword discovery";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
