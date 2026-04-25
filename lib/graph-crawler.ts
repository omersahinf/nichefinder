import {
  recordApiUsage,
  upsertChannels,
  upsertSeedChannel,
  youtubeBatchUnits,
} from "./cache";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { getChannelStats } from "./youtube";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

interface GraphVideoRow {
  description: string | null;
}

interface GraphChannelRow {
  description: string | null;
}

const CHANNEL_ID_REGEX = /(?:youtube\.com\/channel\/|channel_id=)(UC[A-Za-z0-9_-]{20,})/g;

async function logDiscovery(
  job: string,
  candidatesFound: number,
  candidatesAdded: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  const { error } = await client.from("keyword_discovery_log").insert({
    job,
    candidates_found: candidatesFound,
    candidates_added: candidatesAdded,
    metadata,
  });
  if (error) throw error;
}

function extractChannelIds(text: string | null): string[] {
  if (!text) return [];
  return [...text.matchAll(CHANNEL_ID_REGEX)].flatMap((match) => (match[1] ? [match[1]] : []));
}

export async function runGraphCrawler(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "graph-crawler",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const [{ data: videoRows, error: videosError }, { data: channelRows, error: channelsError }] =
    await Promise.all([
      client.from("videos").select("description").order("fetched_at", { ascending: false }).limit(2_000),
      client
        .from("channels")
        .select("description")
        .order("fetched_at", { ascending: false })
        .limit(2_000),
    ]);

  if (videosError) throw videosError;
  if (channelsError) throw channelsError;

  const candidateIds = [
    ...((videoRows ?? []) as GraphVideoRow[]).flatMap((row) => extractChannelIds(row.description)),
    ...((channelRows ?? []) as GraphChannelRow[]).flatMap((row) => extractChannelIds(row.description)),
  ];
  const uniqueIds = [...new Set(candidateIds)].slice(0, 100);
  if (uniqueIds.length === 0) {
    await logDiscovery("graph-crawler", 0, 0, { scanned: candidateIds.length });
    return {
      job: "graph-crawler",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { scanned: candidateIds.length },
    };
  }

  const { data: existingSeeds, error: existingError } = await client
    .from("seed_channels")
    .select("channel_id")
    .in("channel_id", uniqueIds);
  if (existingError) throw existingError;

  const existing = new Set(
    ((existingSeeds ?? []) as Array<{ channel_id: string | null }>).flatMap((row) =>
      row.channel_id ? [row.channel_id] : [],
    ),
  );
  const missingSeedIds = uniqueIds.filter((id) => !existing.has(id)).slice(0, 50);
  if (missingSeedIds.length === 0) {
    await logDiscovery("graph-crawler", uniqueIds.length, 0, { alreadySeeded: uniqueIds.length });
    return {
      job: "graph-crawler",
      candidatesFound: uniqueIds.length,
      candidatesAdded: 0,
      metadata: { alreadySeeded: uniqueIds.length },
    };
  }

  const channels = process.env.YOUTUBE_API_KEY ? await getChannelStats(missingSeedIds) : [];
  if (channels.length > 0) {
    await upsertChannels(channels);
    await Promise.all(
      channels.map((channel) => upsertSeedChannel(channel.id, "mention", 30)),
    );
    const units = youtubeBatchUnits(missingSeedIds.length);
    await recordApiUsage(units, { job: "graph-crawler", candidates: missingSeedIds.length }, "graph_crawler");
  }

  await logDiscovery("graph-crawler", uniqueIds.length, channels.length, {
    parsedChannelIds: candidateIds.length,
  });

  return {
    job: "graph-crawler",
    candidatesFound: uniqueIds.length,
    candidatesAdded: channels.length,
    metadata: { parsedChannelIds: candidateIds.length },
  };
}
