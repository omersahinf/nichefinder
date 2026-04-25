import { NextRequest, NextResponse } from "next/server";
import { runKeywordTuning } from "@/lib/keyword-tuning";

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
    const result = await runKeywordTuning();
    return NextResponse.json({ mode: "tune", result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run growth tuning";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
