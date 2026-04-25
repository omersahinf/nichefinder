import { getTodayQuotaUsage, recordApiUsage } from "./cache";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

const GOOGLE_TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=US";
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";
const QUOTA_BUFFER_UNITS = 200;

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
  "news",
  "live",
  "game",
  "games",
]);

const NOISY_TERMS = new Set([
  "nba",
  "nfl",
  "mlb",
  "nhl",
  "ufc",
  "fifa",
  "trump",
  "biden",
  "election",
  "weather",
  "lottery",
  "score",
]);

interface YoutubeTrendingItem {
  snippet?: {
    title?: string;
  };
}

interface YoutubeTrendingResponse {
  items?: YoutubeTrendingItem[];
  error?: {
    message?: string;
  };
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

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isNicheRelevant(term: string): boolean {
  const normalized = normalizeTerm(term);
  const words = normalized.split(" ").filter(Boolean);
  if (normalized.length < 3 || normalized.length > 48) return false;
  if (words.length === 0 || words.length > 5) return false;
  if (words.some((word) => NOISY_TERMS.has(word))) return false;
  if (words.every((word) => STOPWORDS.has(word))) return false;
  return true;
}

function tokenize(value: string): string[] {
  return normalizeTerm(value)
    .split(" ")
    .filter((word) => word.length > 2 && !STOPWORDS.has(word) && !NOISY_TERMS.has(word));
}

function extractRssTitles(xml: string): string[] {
  return [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/g)]
    .map((match) => decodeXml(match[1] ?? "").trim())
    .filter(Boolean);
}

async function canUseYoutubeUnit(): Promise<boolean> {
  const quota = await getTodayQuotaUsage();
  return quota.used + 1 + QUOTA_BUFFER_UNITS <= quota.guardAt;
}

async function fetchGoogleTrendCandidates(): Promise<string[]> {
  const response = await fetch(GOOGLE_TRENDS_RSS_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Google Trends RSS failed: ${response.status}`);
  }

  const xml = await response.text();
  return extractRssTitles(xml).map(normalizeTerm).filter(isNicheRelevant);
}

async function fetchYoutubeTrendCandidates(): Promise<{
  candidates: string[];
  skipped?: string;
}> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { candidates: [], skipped: "youtube_api_key_missing" };
  if (!(await canUseYoutubeUnit())) return { candidates: [], skipped: "quota_guard" };

  const params = new URLSearchParams({
    key,
    chart: "mostPopular",
    regionCode: "US",
    maxResults: "50",
    part: "snippet",
  });

  const response = await fetch(`${YOUTUBE_API_BASE}/videos?${params}`, { cache: "no-store" });
  const data = (await response.json()) as YoutubeTrendingResponse;
  if (!response.ok) {
    const detail = data.error?.message ? ` - ${data.error.message}` : "";
    throw new Error(`YouTube trending failed: ${response.status}${detail}`);
  }

  await recordApiUsage(1, { job: "keyword_trends", action: "youtube_most_popular" }, "trend");

  const counts = new Map<string, number>();
  for (const item of data.items ?? []) {
    const tokens = tokenize(item.snippet?.title ?? "");
    for (let size = 1; size <= 2; size += 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) {
        const term = tokens.slice(index, index + size).join(" ");
        if (!isNicheRelevant(term)) continue;
        counts.set(term, (counts.get(term) ?? 0) + 1);
      }
    }
  }

  return {
    candidates: [...counts.entries()]
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([term]) => term),
  };
}

export async function runKeywordTrends(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "trend",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const [googleCandidates, youtubeResult] = await Promise.all([
    fetchGoogleTrendCandidates(),
    fetchYoutubeTrendCandidates(),
  ]);

  const { data: existingRows, error: existingError } = await client
    .from("seed_keywords")
    .select("keyword");
  if (existingError) throw existingError;

  const existing = new Set(
    ((existingRows ?? []) as Array<{ keyword: string | null }>).flatMap((row) =>
      row.keyword ? [normalizeTerm(row.keyword)] : [],
    ),
  );

  const seen = new Set(existing);
  const candidates = [...googleCandidates, ...youtubeResult.candidates].filter((term) => {
    const normalized = normalizeTerm(term);
    if (!isNicheRelevant(normalized) || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const rowsToInsert = candidates.map((keyword) => ({
    keyword,
    source: "trend",
    priority: 60,
    expires_at: expiresAt,
  }));

  const { data: inserted, error: insertError } =
    rowsToInsert.length > 0
      ? await client
          .from("seed_keywords")
          .upsert(rowsToInsert, { onConflict: "keyword", ignoreDuplicates: true })
          .select("id")
      : { data: [], error: null };

  if (insertError) throw insertError;

  const candidatesAdded = (inserted ?? []).length;
  await logDiscovery("trend", candidates.length, candidatesAdded, {
    googleCandidates: googleCandidates.length,
    youtubeCandidates: youtubeResult.candidates.length,
    youtubeSkipped: youtubeResult.skipped ?? null,
  });

  return {
    job: "trend",
    candidatesFound: candidates.length,
    candidatesAdded,
    metadata: {
      googleCandidates: googleCandidates.length,
      youtubeCandidates: youtubeResult.candidates.length,
      youtubeSkipped: youtubeResult.skipped ?? null,
    },
  };
}
