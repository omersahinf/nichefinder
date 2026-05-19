import { generateAiJson } from "./ai-client";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

interface SeedKeywordRow {
  keyword: string;
  category: string | null;
  source: string | null;
  total_runs: number | string | null;
  total_channels_added: number | string | null;
}

interface PatternRow {
  pattern: string;
  score: number | string | null;
  metadata: Record<string, unknown> | null;
}

interface AiVerticalResponse {
  keywords?: Array<{
    keyword?: string;
    category?: string;
    priority?: number;
    reason?: string;
  }>;
}

const VERTICALS = [
  "sleep",
  "health",
  "true crime",
  "serial killers",
  "boats",
  "yachts",
  "fishing",
  "aviation",
  "military history",
  "ancient history",
  "survival",
  "camping",
  "gardening",
  "home repair",
  "woodworking",
  "cars",
  "luxury watches",
  "real estate",
  "psychology",
  "relationships",
  "parenting",
  "pets",
  "personal finance",
  "tax",
  "insurance",
  "AI automation",
  "cybersecurity",
  "space",
  "biology",
  "marine life",
  "mythology",
  "lost civilizations",
  "food science",
  "fitness",
  "medical explainers",
  "law",
  "business history",
  "scams",
  "disasters",
  "architecture",
  "urban planning",
  "geography",
  "weird jobs",
  "career change",
  "language learning",
  "study skills",
  "stoicism",
  "minimalism",
  "productivity",
  "travel",
  "off grid living",
];

const INTENTS = [
  "documentary",
  "explained",
  "mistakes",
  "facts",
  "for beginners",
  "before you buy",
  "hidden problems",
  "case study",
  "stories",
  "tips",
  "guide",
  "shorts",
  "why it works",
  "why it fails",
  "timeline",
  "dark side",
  "myths",
  "beginner guide",
  "worst mistakes",
  "survival guide",
];

const BLOCKED_KEYWORD_PARTS = [
  "nba",
  "nfl",
  "mlb",
  "nhl",
  "ufc",
  "live score",
  "match highlights",
  "election",
  "polls",
  "weather",
  "lottery",
  "stock price",
  "crypto price",
  "breaking news",
  "celebrity gossip",
  "red carpet",
];

const TRIVIAL_SUFFIXES = [
  "tutorial",
  "shorts",
  "best",
  "tips",
  "guide",
  "explained",
  "for beginners",
  "2026",
];

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

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordYield(row: SeedKeywordRow): number {
  return Number(row.total_channels_added ?? 0) / Math.max(Number(row.total_runs ?? 0), 1);
}

function parseCandidates(response: AiVerticalResponse): Array<{
  keyword: string;
  category: string | null;
  priority: number;
  reason?: string;
}> {
  return (response.keywords ?? []).flatMap((item) => {
    const keyword = typeof item.keyword === "string" ? normalizeKeyword(item.keyword) : "";
    if (keyword.length < 3 || /^\d+$/.test(keyword)) return [];
    const priority = Number.isFinite(Number(item.priority))
      ? Math.max(45, Math.min(80, Math.round(Number(item.priority))))
      : 60;
    return [
      {
        keyword,
        category:
          typeof item.category === "string" && item.category.trim()
            ? item.category.trim().toLowerCase()
            : null,
        priority,
        reason: typeof item.reason === "string" ? item.reason.slice(0, 180) : undefined,
      },
    ];
  });
}

function withoutTrivialSuffix(keyword: string): string {
  let value = keyword;
  for (const suffix of TRIVIAL_SUFFIXES) {
    value = value.replace(new RegExp(`\\b${suffix.replace(/\s+/g, "\\s+")}\\b$`, "i"), "");
  }
  return value.replace(/\s+/g, " ").trim();
}

function isUsefulCandidate(
  candidate: { keyword: string; category: string | null },
  existing: Set<string>,
): boolean {
  const keyword = candidate.keyword;
  if (BLOCKED_KEYWORD_PARTS.some((part) => keyword.includes(part))) return false;
  if (keyword.length < 3 || /^\d+$/.test(keyword)) return false;
  if (keyword.split(" ").length === 1 && keyword.length < 5) return false;

  const root = withoutTrivialSuffix(keyword);
  if (root && root !== keyword && existing.has(root)) return false;

  const mostlyYearOrModifier = /^(best|top|new|latest)\s+\d{4}$/.test(keyword);
  if (mostlyYearOrModifier) return false;

  return true;
}

export async function runAiVerticalStrategist(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "ai:vertical-strategist",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const apiKey =
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    await logDiscovery("ai:vertical-strategist", 0, 0, { skipped: "ai_api_key_missing" });
    return {
      job: "ai:vertical-strategist",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "ai_api_key_missing" },
    };
  }

  const [{ data: keywordRows, error: keywordError }, { data: patternRows, error: patternError }] =
    await Promise.all([
      client
        .from("seed_keywords")
        .select("keyword,category,source,total_runs,total_channels_added")
        .limit(1_000),
      client
        .from("title_patterns")
        .select("pattern,score,metadata")
        .order("score", { ascending: false })
        .limit(50),
    ]);

  if (keywordError) throw keywordError;
  if (patternError) throw patternError;

  const keywords = (keywordRows ?? []) as SeedKeywordRow[];
  const patterns = (patternRows ?? []) as PatternRow[];
  const existing = new Set(keywords.map((row) => normalizeKeyword(row.keyword)));
  const topKeywords = [...keywords].sort((a, b) => keywordYield(b) - keywordYield(a)).slice(0, 60);
  const sourceCounts = keywords.reduce<Record<string, number>>((counts, row) => {
    const source = row.source ?? "unknown";
    counts[source] = (counts[source] ?? 0) + 1;
    return counts;
  }, {});

  const ai = await generateAiJson<AiVerticalResponse>({
    job: "ai:vertical-strategist",
    maxTokens: 8192,
    temperature: 0.85,
    estimatedUsd: 0.02,
    extraBody: { extra_body: { enable_thinking: true } },
    system:
      "You are a YouTube niche discovery strategist. Return JSON only. Favor diverse, non-obvious evergreen niches and avoid simple suffix variations.",
    user: JSON.stringify({
      task: "Suggest 180 fresh YouTube search keywords that broaden the database into new verticals. Return compact valid JSON only: {\"keywords\":[{\"keyword\":\"...\",\"category\":\"...\",\"priority\":50,\"reason\":\"...\"}]}.",
      constraints: [
        "Do not repeat existing keywords.",
        "Avoid trivial variants like tutorial, shorts, best 2026 unless the topic itself is new.",
        "Avoid sports scores, celebrity gossip, politics, breaking news, weather, and price-tracking terms.",
        "Prefer evergreen documentary, explainer, buyer-risk, health, history, survival, true-crime, hobby, and weird-skill angles.",
        "Prefer TubeLab-style discoverable niches and sub-niches.",
        "Use English keyword copy.",
        "Keep each reason under 8 words.",
        "Return a complete valid JSON object with no markdown.",
      ],
      verticalLibrarySize: VERTICALS.length * INTENTS.length,
      verticals: VERTICALS,
      intents: INTENTS,
      currentSourceCounts: sourceCounts,
      topPerformingKeywords: topKeywords.map((row) => ({
        keyword: row.keyword,
        category: row.category,
        yield: keywordYield(row),
      })),
      emergingPatterns: patterns.map((row) => ({
        pattern: row.pattern,
        score: Number(row.score ?? 0),
        metadata: row.metadata,
      })),
    }),
  });

  const candidates = parseCandidates(ai.data).filter(
    (candidate) => !existing.has(candidate.keyword) && isUsefulCandidate(candidate, existing),
  );
  const rowsToInsert = candidates.slice(0, 180).map((candidate) => ({
    keyword: candidate.keyword,
    category: candidate.category,
    priority: candidate.priority,
    source: "ai_vertical",
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
  await logDiscovery("ai:vertical-strategist", candidates.length, candidatesAdded, {
    provider: ai.provider,
    model: ai.model,
    costUsd: ai.costUsd,
    reasons: candidates.slice(0, 20).map((candidate) => ({
      keyword: candidate.keyword,
      reason: candidate.reason ?? null,
    })),
  });

  return {
    job: "ai:vertical-strategist",
    candidatesFound: candidates.length,
    candidatesAdded,
    metadata: { provider: ai.provider, model: ai.model, costUsd: ai.costUsd },
  };
}
