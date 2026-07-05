import { getSupabaseAdmin } from "../lib/supabase";
import { classifyVideoContent, type ContentQualityReason } from "../lib/content-quality";
import { parseIsoDurationToSeconds } from "../lib/duration";

interface VideoRow {
  youtube_id: string;
  channel_id: string;
  channel_title: string | null;
  title: string;
  description: string | null;
  duration: string | null;
  duration_seconds: number | string | null;
  tags: string[] | null;
}

const APPLY = process.argv.includes("--apply");
const BATCH_SIZE = 1000;
const WRITE_BATCH_SIZE = 100;
const JUNK_CHANNEL_THRESHOLD = 0.5;
const MIN_CHANNEL_SAMPLE = 3;

function inc(map: Map<string, number>, key: string, count = 1): void {
  map.set(key, (map.get(key) ?? 0) + count);
}

async function updateIdsInChunks(
  table: string,
  idColumn: string,
  ids: string[],
  values: Record<string, unknown>,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  for (let i = 0; i < ids.length; i += WRITE_BATCH_SIZE) {
    const chunk = ids.slice(i, i + WRITE_BATCH_SIZE);
    const { error } = await client.from(table).update(values).in(idColumn, chunk);
    if (error) throw error;
  }
}

function reasonKey(reasons: string[]): string {
  return [...reasons].sort().join("|");
}

async function main() {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  let from = 0;
  const reasonCounts = new Map<string, number>();
  const channelStats = new Map<string, { total: number; junk: number; reasons: Map<ContentQualityReason, number> }>();
  let total = 0;
  let junkVideos = 0;

  for (;;) {
    const { data, error } = await client
      .from("videos")
      .select("youtube_id,channel_id,channel_title,title,description,duration,duration_seconds,tags")
      .order("youtube_id", { ascending: true })
      .range(from, from + BATCH_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as VideoRow[];
    if (rows.length === 0) break;

    const updates = rows.map((row) => {
      const durationSeconds =
        Number(row.duration_seconds ?? 0) || parseIsoDurationToSeconds(row.duration ?? "");
      const classification = classifyVideoContent({
        title: row.title,
        description: row.description ?? "",
        duration: row.duration ?? "",
        durationSeconds,
        tags: row.tags ?? [],
      });

      total += 1;
      const stats = channelStats.get(row.channel_id) ?? { total: 0, junk: 0, reasons: new Map() };
      stats.total += 1;
      if (classification.contentClass === "junk") {
        junkVideos += 1;
        stats.junk += 1;
        for (const reason of classification.reasons) {
          inc(reasonCounts, reason);
          inc(stats.reasons, reason);
        }
      }
      channelStats.set(row.channel_id, stats);

      return {
        youtube_id: row.youtube_id,
        content_class: classification.contentClass,
        content_reasons: classification.reasons,
        content_score: classification.score,
      };
    });

    if (APPLY && updates.length > 0) {
      const groups = new Map<
        string,
        {
          ids: string[];
          values: {
            content_class: string;
            content_reasons: string[];
            content_score: number;
          };
        }
      >();
      for (const update of updates) {
        const key = [
          update.content_class,
          reasonKey(update.content_reasons),
          update.content_score,
        ].join("::");
        const current = groups.get(key) ?? {
          ids: [],
          values: {
            content_class: update.content_class,
            content_reasons: update.content_reasons,
            content_score: update.content_score,
          },
        };
        current.ids.push(update.youtube_id);
        groups.set(key, current);
      }
      for (const group of groups.values()) {
        await updateIdsInChunks("videos", "youtube_id", group.ids, group.values);
      }
    }

    from += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }

  const channelUpdates = [...channelStats.entries()].map(([channelId, stats]) => {
    const junkVideoRatio = stats.total > 0 ? stats.junk / stats.total : 0;
    const reasons = [...stats.reasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason]) => reason);
    return {
      channelId,
      contentClass:
        stats.total >= MIN_CHANNEL_SAMPLE && junkVideoRatio >= JUNK_CHANNEL_THRESHOLD ? "junk" : "niche",
      contentReasons: reasons,
      junkVideoRatio,
    };
  });
  const junkChannelIds = channelUpdates
    .filter((entry) => entry.contentClass === "junk")
    .map((entry) => entry.channelId);

  if (APPLY) {
    const channelGroups = new Map<
      string,
      {
        ids: string[];
        values: {
          content_class: string;
          content_reasons: string[];
          junk_video_ratio: number;
        };
      }
    >();
    for (const entry of channelUpdates) {
      const ratio = Number(entry.junkVideoRatio.toFixed(4));
      const key = [entry.contentClass, reasonKey(entry.contentReasons), ratio].join("::");
      const current = channelGroups.get(key) ?? {
        ids: [],
        values: {
          content_class: entry.contentClass,
          content_reasons: entry.contentReasons,
          junk_video_ratio: ratio,
        },
      };
      current.ids.push(entry.channelId);
      channelGroups.set(key, current);
    }

    for (const group of channelGroups.values()) {
      await updateIdsInChunks("channels", "youtube_id", group.ids, group.values);
    }

    if (junkChannelIds.length > 0) {
      await updateIdsInChunks("seed_channels", "channel_id", junkChannelIds, {
        disabled_at: new Date().toISOString(),
        disabled_reason: "content_quality_backfill",
      });
    }
  }

  const topReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        videosScanned: total,
        junkVideos,
        nicheVideos: total - junkVideos,
        junkVideoRatio: total > 0 ? junkVideos / total : 0,
        channelsScanned: channelUpdates.length,
        junkChannels: junkChannelIds.length,
        topReasons,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
