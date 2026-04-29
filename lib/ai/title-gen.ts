import { getLatestNicheSnapshot } from "../cache";
import { normalizeKeyword } from "../niche-utils";
import { getSupabaseAdmin } from "../supabase";
import { anthropicApiKey, anthropicModel, requestAnthropicText } from "./anthropic";

export interface GeneratedTitleSet {
  keyword: string;
  model: string;
  titles: string[];
  createdAt: string;
}

interface TitleGenerationRow {
  keyword: string;
  model: string;
  titles_json: string[] | null;
  created_at: string;
}

function clipText(value: string, maxLength = 110): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 1).trimEnd() + "...";
}

function parseTitleList(text: string): string[] {
  const cleaned = text.trim().replace(/```json|```/g, "");

  try {
    const parsed = JSON.parse(cleaned) as { titles?: unknown };
    const values = Array.isArray(parsed.titles) ? parsed.titles : [];
    const normalized = values
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    if (normalized.length > 0) return normalized.slice(0, 10);
  } catch {}

  return cleaned
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
}

function buildPrompt(keyword: string, titles: string[]): string {
  return [
    "You are generating YouTube video title ideas from proven outlier patterns.",
    "Return strict JSON only with this schema:",
    '{"titles":["Title 1","Title 2","Title 3","Title 4","Title 5","Title 6","Title 7","Title 8","Title 9","Title 10"]}',
    "Rules:",
    "- Exactly 10 title strings.",
    "- English only.",
    "- Use the source titles as pattern inspiration, not direct copies.",
    "- Keep each title under 90 characters.",
    "- Vary the hook and framing while staying inside the same niche.",
    "- Do not number titles. Do not add commentary.",
    "",
    `Keyword: ${keyword}`,
    "Reference outlier titles:",
    ...titles.map((title, index) => `${index + 1}. ${title}`),
  ].join("\n");
}

async function storeTitleGeneration(input: {
  userId: string;
  keyword: string;
  titles: string[];
  createdAt: string;
}): Promise<GeneratedTitleSet> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const model = anthropicModel();
  const { data, error } = await client
    .from("ai_title_generations")
    .insert({
      user_id: input.userId,
      normalized_keyword: normalizeKeyword(input.keyword),
      keyword: input.keyword,
      model,
      titles_json: input.titles,
      created_at: input.createdAt,
    })
    .select("keyword,model,titles_json,created_at")
    .single();

  if (error) throw error;

  const row = data as TitleGenerationRow;
  return {
    keyword: row.keyword,
    model: row.model,
    titles: row.titles_json ?? [],
    createdAt: row.created_at,
  };
}

export async function countTodayTitleGenerations(userId: string): Promise<number> {
  const client = getSupabaseAdmin();
  if (!client) return 0;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count, error } = await client
    .from("ai_title_generations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfDay.toISOString());

  if (error) throw error;
  return count ?? 0;
}

export async function generateTitlesForNiche(input: {
  userId: string;
  keyword: string;
}): Promise<GeneratedTitleSet> {
  const normalizedKeyword = normalizeKeyword(input.keyword);
  if (!normalizedKeyword) throw new Error("Keyword is required");
  if (!anthropicApiKey()) throw new Error("ANTHROPIC_API_KEY missing");

  const snapshot = await getLatestNicheSnapshot(input.keyword);
  if (!snapshot || snapshot.results.length === 0) {
    throw new Error("No cached niche snapshot available for this keyword");
  }

  const referenceTitles = [...snapshot.results]
    .sort((a, b) => b.outlierScore - a.outlierScore)
    .slice(0, 50)
    .map((video) => clipText(video.title))
    .filter(Boolean);

  if (referenceTitles.length < 10) {
    throw new Error("Not enough outlier titles available for this niche");
  }

  const prompt = buildPrompt(snapshot.keyword, referenceTitles);
  const text = await requestAnthropicText({
    prompt,
    maxTokens: 700,
    temperature: 0.7,
  });

  const titles = parseTitleList(text);
  if (titles.length < 10) {
    throw new Error("Anthropic returned fewer than 10 usable titles");
  }

  return storeTitleGeneration({
    userId: input.userId,
    keyword: snapshot.keyword,
    titles: titles.slice(0, 10),
    createdAt: new Date().toISOString(),
  });
}
