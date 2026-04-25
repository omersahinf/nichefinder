import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

interface VideoPatternRow {
  youtube_id: string;
  channel_id: string;
  title: string;
  views: number | string | null;
  outlier_score: number | string | null;
  published_at: string | null;
  fetched_at: string | null;
}

interface PatternCandidate {
  pattern: string;
  patternType: string;
  examples: Array<{
    videoId: string;
    channelId: string;
    title: string;
    slotValue: string | null;
    views: number;
    outlierScore: number;
    viewsPerHour: number;
    publishedAt: string | null;
  }>;
}

const TITLE_REGEXES: Array<{ pattern: string; regex: RegExp }> = [
  {
    pattern: "why it sucks to be born as {topic}",
    regex: /^why it sucks to be born as (?:an? |the )?(.{3,80})$/i,
  },
  {
    pattern: "what it was like to be {topic}",
    regex: /^what it was like to be (?:an? |the )?(.{3,80})$/i,
  },
  {
    pattern: "why you would not survive {topic}",
    regex: /^why you (?:would not|wouldn't|won't) survive (?:as |in |the )?(.{3,80})$/i,
  },
  {
    pattern: "the worst time to be {topic}",
    regex: /^the worst time to be (?:an? |the )?(.{3,80})$/i,
  },
  {
    pattern: "life as {topic}",
    regex: /^life as (?:an? |the )?(.{3,80})$/i,
  },
  {
    pattern: "i survived as {topic}",
    regex: /^i survived as (?:an? |the )?(.{3,80})$/i,
  },
  {
    pattern: "what if you were {topic}",
    regex: /^what if you were (?:an? |the )?(.{3,80})$/i,
  },
];

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function viewsPerHour(row: VideoPatternRow): number {
  const publishedAt = row.published_at ? new Date(row.published_at).getTime() : Date.now();
  const ageHours = Math.max(1, (Date.now() - publishedAt) / 3_600_000);
  return Number(row.views ?? 0) / ageHours;
}

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

async function upsertPattern(candidate: PatternCandidate): Promise<boolean> {
  const client = getSupabaseAdmin();
  if (!client) return false;

  const channels = new Set(candidate.examples.map((example) => example.channelId));
  const slots = new Set(
    candidate.examples.flatMap((example) => (example.slotValue ? [example.slotValue] : [])),
  );
  const avgOutlier =
    candidate.examples.reduce((sum, example) => sum + example.outlierScore, 0) /
    Math.max(candidate.examples.length, 1);
  const avgViewsPerHour =
    candidate.examples.reduce((sum, example) => sum + example.viewsPerHour, 0) /
    Math.max(candidate.examples.length, 1);
  const score =
    channels.size * 4 + slots.size * 3 + candidate.examples.length + avgOutlier * 2;

  const sortedDates = candidate.examples
    .flatMap((example) => (example.publishedAt ? [example.publishedAt] : []))
    .sort();

  const { data, error } = await client
    .from("title_patterns")
    .upsert(
      {
        pattern: candidate.pattern,
        pattern_type: candidate.patternType,
        score,
        velocity_score: avgViewsPerHour,
        video_count: candidate.examples.length,
        channel_count: channels.size,
        slot_count: slots.size,
        avg_outlier_score: avgOutlier,
        avg_views_per_hour: avgViewsPerHour,
        first_seen_at: sortedDates[0] ?? null,
        last_seen_at: sortedDates[sortedDates.length - 1] ?? null,
        metadata: {
          slots: [...slots].slice(0, 50),
          titles: candidate.examples.slice(0, 10).map((example) => example.title),
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "pattern" },
    )
    .select("id")
    .single();

  if (error) throw error;

  const patternId = (data as { id: string }).id;
  const { error: exampleError } = await client.from("title_pattern_examples").upsert(
    candidate.examples.slice(0, 25).map((example) => ({
      pattern_id: patternId,
      video_id: example.videoId,
      channel_id: example.channelId,
      title: example.title,
      slot_value: example.slotValue,
      views: example.views,
      outlier_score: example.outlierScore,
      views_per_hour: example.viewsPerHour,
      published_at: example.publishedAt,
    })),
    { onConflict: "pattern_id,video_id" },
  );
  if (exampleError) throw exampleError;

  if (channels.size >= 2 && slots.size >= 2 && avgViewsPerHour >= 100) {
    await client.from("format_alerts").insert({
      pattern_id: patternId,
      alert_type: "breakout_pattern",
      severity: Math.min(100, Math.round(score)),
      message: `Breakout title format detected: ${candidate.pattern}`,
      metadata: { score, avgViewsPerHour, channels: channels.size, slots: slots.size },
    });
  }

  return true;
}

export async function runPatternMiner(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "pattern-miner",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("videos")
    .select("youtube_id,channel_id,title,views,outlier_score,published_at,fetched_at")
    .gte("published_at", since)
    .limit(5_000);
  if (error) throw error;

  const candidates = new Map<string, PatternCandidate>();
  for (const row of (data ?? []) as VideoPatternRow[]) {
    const normalized = normalizeTitle(row.title);
    for (const matcher of TITLE_REGEXES) {
      const match = normalized.match(matcher.regex);
      if (!match?.[1]) continue;
      const current = candidates.get(matcher.pattern) ?? {
        pattern: matcher.pattern,
        patternType: "regex",
        examples: [],
      };
      current.examples.push({
        videoId: row.youtube_id,
        channelId: row.channel_id,
        title: row.title,
        slotValue: match[1].trim().slice(0, 80),
        views: Number(row.views ?? 0),
        outlierScore: Number(row.outlier_score ?? 0),
        viewsPerHour: viewsPerHour(row),
        publishedAt: row.published_at,
      });
      candidates.set(matcher.pattern, current);
    }
  }

  const ranked = [...candidates.values()].filter((candidate) => {
    const channels = new Set(candidate.examples.map((example) => example.channelId));
    const slots = new Set(candidate.examples.flatMap((example) => example.slotValue ?? []));
    return candidate.examples.length >= 2 && channels.size >= 1 && slots.size >= 2;
  });

  let added = 0;
  for (const candidate of ranked) {
    if (await upsertPattern(candidate)) added += 1;
  }

  await logDiscovery("pattern-miner", ranked.length, added, {
    videosScanned: (data ?? []).length,
  });

  return {
    job: "pattern-miner",
    candidatesFound: ranked.length,
    candidatesAdded: added,
    metadata: { videosScanned: (data ?? []).length },
  };
}
