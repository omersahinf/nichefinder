import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

interface SeedKeywordRow {
  keyword: string;
  total_runs: number | string | null;
  total_channels_added: number | string | null;
}

interface AiKeywordCandidate {
  keyword: string;
  category: string | null;
  priority: number;
  reason?: string;
}

interface AnthropicTextContent {
  type: "text";
  text: string;
}

interface AnthropicResponse {
  content?: AnthropicTextContent[];
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

function normalizeKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function yieldFor(row: SeedKeywordRow): number {
  return Number(row.total_channels_added ?? 0) / Math.max(Number(row.total_runs ?? 0), 1);
}

function extractJsonArray(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Claude response did not include a JSON array");
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

function parseCandidates(value: unknown): AiKeywordCandidate[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): AiKeywordCandidate[] => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const keyword = typeof record.keyword === "string" ? normalizeKeyword(record.keyword) : "";
    if (keyword.length < 3 || /^\d+$/.test(keyword)) return [];

    const category =
      typeof record.category === "string" && record.category.trim()
        ? record.category.trim().toLowerCase()
        : null;
    const rawPriority = Number(record.priority);
    const priority = Number.isFinite(rawPriority)
      ? Math.max(50, Math.min(80, Math.round(rawPriority)))
      : 60;
    const reason = typeof record.reason === "string" ? record.reason.slice(0, 160) : undefined;

    return [{ keyword, category, priority, reason }];
  });
}

async function getTopKeywords(): Promise<string[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("seed_keywords")
    .select("keyword,total_runs,total_channels_added")
    .limit(500);
  if (error) throw error;

  return ((data ?? []) as SeedKeywordRow[])
    .sort((a, b) => yieldFor(b) - yieldFor(a))
    .slice(0, 50)
    .map((row) => row.keyword);
}

async function getExistingKeywordSet(): Promise<Set<string>> {
  const client = getSupabaseAdmin();
  if (!client) return new Set();

  const { data, error } = await client.from("seed_keywords").select("keyword");
  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ keyword: string | null }>).flatMap((row) =>
      row.keyword ? [normalizeKeyword(row.keyword)] : [],
    ),
  );
}

async function askClaude(topKeywords: string[], apiKey: string): Promise<AiKeywordCandidate[]> {
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system:
        "Suggest evergreen YouTube niche keywords with high RPM and discovery potential. Output JSON array only.",
      messages: [
        {
          role: "user",
          content: `Top performing keywords: ${JSON.stringify(
            topKeywords,
          )}. Suggest 20 fresh evergreen niche keywords NOT in this list. Each item: { "keyword": "...", "category": "finance|tech|education|...", "priority": 50-80, "reason": "short" }`,
        },
      ],
    }),
  });

  const data = (await response.json()) as AnthropicResponse;
  if (!response.ok) {
    const detail = data.error?.message ? ` - ${data.error.message}` : "";
    throw new Error(`Claude keyword generation failed: ${response.status}${detail}`);
  }

  const text = data.content?.find((content) => content.type === "text")?.text ?? "";
  return parseCandidates(extractJsonArray(text));
}

export async function runKeywordAi(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "ai",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    await logDiscovery("ai", 0, 0, { skipped: "anthropic_api_key_missing" });
    return {
      job: "ai",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "anthropic_api_key_missing" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const topKeywords = await getTopKeywords();
  const existing = await getExistingKeywordSet();
  const seen = new Set(existing);
  const candidates = (await askClaude(topKeywords, apiKey)).filter((candidate) => {
    if (seen.has(candidate.keyword)) return false;
    seen.add(candidate.keyword);
    return true;
  });

  const rowsToInsert = candidates.map((candidate) => ({
    keyword: candidate.keyword,
    category: candidate.category,
    priority: candidate.priority,
    source: "ai_generated",
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
  await logDiscovery("ai", candidates.length, candidatesAdded, {
    model: CLAUDE_MODEL,
    topKeywords: topKeywords.length,
    reasons: candidates.map((candidate) => ({
      keyword: candidate.keyword,
      reason: candidate.reason ?? null,
    })),
  });

  return {
    job: "ai",
    candidatesFound: candidates.length,
    candidatesAdded,
    metadata: { model: CLAUDE_MODEL, topKeywords: topKeywords.length },
  };
}
