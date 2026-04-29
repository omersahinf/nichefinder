import { NextRequest, NextResponse } from "next/server";
import {
  listSeedChannels,
  recordApiUsage,
  upsertChannels,
  upsertSeedChannel,
  youtubeBatchUnits,
} from "@/lib/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getChannelStats } from "@/lib/youtube";
import { requireAdminApi } from "@/lib/admin-guard";

export const dynamic = "force-dynamic";

function extractChannelId(input: unknown): string {
  const raw = typeof input === "string" ? input.trim() : "";
  const fromUrl = raw.match(/(?:channel\/|channel_id=)(UC[A-Za-z0-9_-]{20,})/);
  const value = fromUrl?.[1] ?? raw;

  if (!/^UC[A-Za-z0-9_-]{20,}$/.test(value)) {
    throw new Error("Valid YouTube channel ID required");
  }

  return value;
}

async function channelExists(channelId: string): Promise<boolean> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const { data, error } = await client
    .from("channels")
    .select("youtube_id")
    .eq("youtube_id", channelId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function ensureChannelRow(channelId: string): Promise<void> {
  if (await channelExists(channelId)) return;

  if (!process.env.YOUTUBE_API_KEY) {
    throw new Error("Channel is not cached and YOUTUBE_API_KEY is missing");
  }

  const channels = await getChannelStats([channelId]);
  if (channels.length === 0) {
    throw new Error("YouTube channel not found");
  }

  await upsertChannels(channels);
  await recordApiUsage(youtubeBatchUnits(1), {
    action: "admin_seed_add",
    channelId,
  });
}

export async function GET(): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  try {
    const seeds = await listSeedChannels(200);
    return NextResponse.json({ seeds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list seeds";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  try {
    const body = (await req.json()) as {
      channelId?: string;
      addedVia?: string;
      priority?: number;
    };
    const channelId = extractChannelId(body.channelId);
    const priority = Number.isFinite(body.priority) ? Number(body.priority) : 50;

    await ensureChannelRow(channelId);
    await upsertSeedChannel(channelId, "manual", Math.min(100, Math.max(0, priority)));

    const seeds = await listSeedChannels(200);
    return NextResponse.json({ seeds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add seed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
