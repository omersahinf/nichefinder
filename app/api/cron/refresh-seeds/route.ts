import { NextRequest, NextResponse } from "next/server";
import { refreshSeedChannels } from "@/lib/refresh-seeds";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshSeedChannels({ limit: 200, usageSource: "cron" });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh seeds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
