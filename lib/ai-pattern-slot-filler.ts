import { generateAiJson } from "./ai-client";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

interface PatternRow {
  id: string;
  pattern: string;
  score: number | string | null;
  metadata: Record<string, unknown> | null;
}

interface AiSlotResponse {
  keywords?: Array<{
    keyword?: string;
    source_pattern?: string;
    category?: string;
    priority?: number;
    reason?: string;
  }>;
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

function parseCandidates(response: AiSlotResponse): Array<{
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
      : 55;
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

export async function runAiPatternSlotFiller(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "ai:pattern-slot-filler",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const apiKey =
    process.env.AI_API_KEY?.trim() ||
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    await logDiscovery("ai:pattern-slot-filler", 0, 0, { skipped: "ai_api_key_missing" });
    return {
      job: "ai:pattern-slot-filler",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "ai_api_key_missing" },
    };
  }

  const [{ data: patternRows, error: patternError }, { data: keywordRows, error: keywordError }] =
    await Promise.all([
      client
        .from("title_patterns")
        .select("id,pattern,score,metadata")
        .order("score", { ascending: false })
        .limit(30),
      client.from("seed_keywords").select("keyword").limit(2_000),
    ]);

  if (patternError) throw patternError;
  if (keywordError) throw keywordError;

  const patterns = ((patternRows ?? []) as PatternRow[]).filter((row) =>
    row.pattern.includes("{topic}"),
  );
  if (patterns.length === 0) {
    await logDiscovery("ai:pattern-slot-filler", 0, 0, { skipped: "no_slot_patterns" });
    return {
      job: "ai:pattern-slot-filler",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "no_slot_patterns" },
    };
  }

  const existing = new Set(
    ((keywordRows ?? []) as Array<{ keyword: string | null }>).flatMap((row) =>
      row.keyword ? [normalizeKeyword(row.keyword)] : [],
    ),
  );

  const ai = await generateAiJson<AiSlotResponse>({
    job: "ai:pattern-slot-filler",
    maxTokens: 4096,
    temperature: 0.8,
    estimatedUsd: 0.02,
    extraBody: { extra_body: { enable_thinking: true } },
    system:
      "You fill viral YouTube title pattern slots with high-discovery sub-niches. Return JSON only.",
    user: JSON.stringify({
      task: "For each pattern, generate search keywords that preserve the viral format but diversify topics. Return {\"keywords\":[{\"keyword\":\"...\",\"source_pattern\":\"...\",\"category\":\"...\",\"priority\":50,\"reason\":\"...\"}]} only.",
      constraints: [
        "Avoid repeats.",
        "Prefer specific slots like dinosaur species, professions, historical roles, animals, diseases, disasters, vehicles, scams, survival scenarios.",
        "Keywords should be usable as YouTube search queries.",
        "English only.",
      ],
      patterns: patterns.map((row) => ({
        pattern: row.pattern,
        score: Number(row.score ?? 0),
        examples: row.metadata?.titles ?? [],
        observedSlots: row.metadata?.slots ?? [],
      })),
    }),
  });

  const candidates = parseCandidates(ai.data).filter((candidate) => !existing.has(candidate.keyword));
  const rowsToInsert = candidates.slice(0, 80).map((candidate) => ({
    keyword: candidate.keyword,
    category: candidate.category,
    priority: candidate.priority,
    source: "ai_slot",
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
  await logDiscovery("ai:pattern-slot-filler", candidates.length, candidatesAdded, {
    provider: ai.provider,
    model: ai.model,
    costUsd: ai.costUsd,
    patterns: patterns.length,
    reasons: candidates.slice(0, 20).map((candidate) => ({
      keyword: candidate.keyword,
      reason: candidate.reason ?? null,
    })),
  });

  return {
    job: "ai:pattern-slot-filler",
    candidatesFound: candidates.length,
    candidatesAdded,
    metadata: { provider: ai.provider, model: ai.model, costUsd: ai.costUsd, patterns: patterns.length },
  };
}
