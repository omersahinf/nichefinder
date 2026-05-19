import { NextRequest, NextResponse } from "next/server";
import { runAutoSearch } from "@/lib/auto-search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runAutoSearch({
      maxKeywords: 30,
      source: "cron_auto_search_2",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run auto-search";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
