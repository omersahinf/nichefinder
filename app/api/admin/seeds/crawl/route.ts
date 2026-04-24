import { NextRequest, NextResponse } from "next/server";
import { refreshSeedChannels } from "@/lib/refresh-seeds";

export const dynamic = "force-dynamic";

const adminEnabled = (): boolean => process.env.ADMIN_UI_ENABLED === "true";

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Admin UI disabled" }, { status: 404 });
}

function cleanChannelIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(value)]
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^UC[A-Za-z0-9_-]{20,}$/.test(item))
    .slice(0, 50);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!adminEnabled()) return unauthorized();

  try {
    if (!process.env.YOUTUBE_API_KEY) {
      return NextResponse.json({ error: "YOUTUBE_API_KEY missing" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as { channelIds?: string[] };
    const requestedIds = cleanChannelIds(body.channelIds);

    const result = await refreshSeedChannels({
      channelIds: requestedIds,
      limit: 50,
      usageSource: "admin",
    });

    return NextResponse.json({
      requested: result.seeds,
      refreshed: result.refreshedChannels,
      newVideos: result.newVideos,
      quotaUnits: result.units,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh seeds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
