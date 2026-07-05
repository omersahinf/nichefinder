import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "to",
  "of",
  "for",
  "with",
  "and",
  "or",
  "in",
  "on",
  "at",
  "my",
  "your",
  "this",
  "that",
  "is",
  "was",
  "are",
  "how",
  "what",
  "why",
  "best",
  "top",
  "vs",
  "shorts",
  "trailer",
  "teaser",
  "live",
  "stream",
  "gameplay",
  "highlights",
]);

const BLOCKED_TERMS = new Set([
  "shorts",
  "youtube shorts",
  "trailer",
  "teaser",
  "promo",
  "gameplay",
  "minecraft",
  "fortnite",
  "roblox",
  "match highlights",
  "game highlights",
  "live stream",
  "movie clip",
  "episode",
]);

function isMissingContentQualityColumn(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    String(error.message).includes("content_class")
  );
}

interface VideoKeywordRow {
  tags: string[] | null;
  title: string | null;
  channel_id: string | null;
}

interface CandidateStats {
  term: string;
  occurrences: number;
  channels: Set<string>;
}

export interface KeywordDiscoveryResult {
  job: string;
  candidatesFound: number;
  candidatesAdded: number;
  metadata: Record<string, unknown>;
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

function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(title: string): string[] {
  return normalizeTerm(title)
    .split(" ")
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function addCandidate(
  map: Map<string, CandidateStats>,
  rawTerm: string,
  channelId: string,
): void {
  const term = normalizeTerm(rawTerm);
  if (term.length < 3 || /^\d+$/.test(term)) return;
  if (BLOCKED_TERMS.has(term)) return;
  if ([...BLOCKED_TERMS].some((blocked) => term.includes(blocked))) return;

  const current = map.get(term) ?? {
    term,
    occurrences: 0,
    channels: new Set<string>(),
  };
  current.occurrences += 1;
  current.channels.add(channelId);
  map.set(term, current);
}

async function getExistingKeywordSet(): Promise<Set<string>> {
  const client = getSupabaseAdmin();
  if (!client) return new Set();

  const { data, error } = await client.from("seed_keywords").select("keyword");
  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ keyword: string | null }>).flatMap((row) =>
      row.keyword ? [row.keyword.toLowerCase()] : [],
    ),
  );
}

export async function runKeywordExtraction(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "extraction",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const readVideos = async (includeContentQuality: boolean) => {
    let query = client.from("videos").select("tags,title,channel_id");
    if (includeContentQuality) query = query.eq("content_class", "niche");
    return query.gte("fetched_at", since).limit(5_000);
  };
  let { data, error } = await readVideos(true);
  if (error && isMissingContentQualityColumn(error)) {
    const legacy = await readVideos(false);
    data = legacy.data;
    error = legacy.error;
  }

  if (error) throw error;

  const rows = (data ?? []) as VideoKeywordRow[];
  const candidates = new Map<string, CandidateStats>();

  for (const row of rows) {
    const channelId = row.channel_id?.trim();
    if (!channelId) continue;

    for (const tag of row.tags ?? []) {
      addCandidate(candidates, tag, channelId);
    }

    const tokens = tokenize(row.title ?? "");
    for (let size = 2; size <= 3; size += 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        addCandidate(candidates, tokens.slice(index, index + size).join(" "), channelId);
      }
    }
  }

  const existing = await getExistingKeywordSet();
  const ranked = [...candidates.values()]
    .filter((candidate) => {
      if (existing.has(candidate.term)) return false;
      if (candidate.term.length < 3 || /^\d+$/.test(candidate.term)) return false;
      return candidate.channels.size >= 3 || candidate.occurrences >= 3;
    })
    .map((candidate) => ({
      keyword: candidate.term,
      score: candidate.channels.size * 2 + candidate.occurrences,
    }))
    .sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword))
    .slice(0, 30);

  const insertRows = ranked.map((candidate) => ({
    keyword: candidate.keyword,
    category: null,
    priority: 40,
    source: "extracted",
  }));

  const { data: inserted, error: insertError } =
    insertRows.length > 0
      ? await client
          .from("seed_keywords")
          .upsert(insertRows, { onConflict: "keyword", ignoreDuplicates: true })
          .select("id")
      : { data: [], error: null };

  if (insertError) throw insertError;

  const candidatesAdded = (inserted ?? []).length;
  await logDiscovery("extraction", ranked.length, candidatesAdded, {
    videosScanned: rows.length,
    since,
  });

  return {
    job: "extraction",
    candidatesFound: ranked.length,
    candidatesAdded,
    metadata: { videosScanned: rows.length },
  };
}
