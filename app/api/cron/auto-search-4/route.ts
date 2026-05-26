import { NextRequest, NextResponse } from "next/server";
import { handleAutoSearchCron } from "@/lib/cron-auto-search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  return handleAutoSearchCron(req, "cron_auto_search_4");
}
