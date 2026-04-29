import { getLatestNicheSnapshot } from "../cache";
import { normalizeKeyword } from "../niche-utils";
import { getSupabaseAdmin } from "../supabase";
import { requestAnthropicText, anthropicApiKey, anthropicModel } from "./anthropic";

export interface GeneratedIdea {
  title: string;
  hook: string;
}

export interface GeneratedIdeaSet {
  keyword: string;
  model: string;
  ideas: GeneratedIdea[];
  createdAt: string;
}

interface IdeaGenerationRow {
  keyword: string;
  model: string;
  ideas_json: GeneratedIdea[] | null;
  created_at: string;
}

function clipText(value: string, maxLength = 120): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 1).trimEnd() + "...";
}

function parseIdeaList(text: string): GeneratedIdea[] {
  const cleaned = text.trim().replace(/```json|```/g, "");

  try {
    const parsed = JSON.parse(cleaned) as { ideas?: unknown };
    const values = Array.isArray(parsed.ideas) ? parsed.ideas : [];
    const normalized = values
      .map((value) =>
        typeof value === "object" && value !== null
          ? {
              title:
                "title" in value && typeof value.title === "string" ? value.title.trim() : "",
              hook: "hook" in value && typeof value.hook === "string" ? value.hook.trim() : "",
            }
          : { title: "", hook: "" },
      )
      .filter((value) => value.title && value.hook);

    if (normalized.length > 0) return normalized.slice(0, 10);
  } catch {}

  return cleaned
    .split("\n")
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, 10)
    .map((line) => {
      const [title, hook] = line.split(/\s+\|\s+/);
      return {
        title: title?.trim() || line,
        hook: hook?.trim() || "Built from niche outlier patterns.",
      };
    });
}

function buildPrompt(keyword: string, references: string[]): string {
  return [
    "You are generating YouTube video ideas from niche outlier patterns.",
    "Return strict JSON only with this schema:",
    '{"ideas":[{"title":"Idea 1","hook":"Why this could click"},{"title":"Idea 2","hook":"Why this could click"}]}',
    "Rules:",
    "- Exactly 10 objects in ideas.",
    "- English only.",
    "- Each object must have title and hook.",
    "- Titles should be concrete video concepts, not generic themes.",
    "- Hooks should be one sentence explaining the angle or why viewers would click.",
    "- Use the source patterns as inspiration, not copies.",
    "- Do not add commentary outside the JSON.",
    "",
    `Keyword: ${keyword}`,
    "Reference outlier titles:",
    ...references.map((title, index) => `${index + 1}. ${title}`),
  ].join("\n");
}

async function storeIdeaGeneration(input: {
  userId: string;
  keyword: string;
  ideas: GeneratedIdea[];
  createdAt: string;
}): Promise<GeneratedIdeaSet> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const model = anthropicModel();
  const { data, error } = await client
    .from("ai_idea_generations")
    .insert({
      user_id: input.userId,
      normalized_keyword: normalizeKeyword(input.keyword),
      keyword: input.keyword,
      model,
      ideas_json: input.ideas,
      created_at: input.createdAt,
    })
    .select("keyword,model,ideas_json,created_at")
    .single();

  if (error) throw error;

  const row = data as IdeaGenerationRow;
  return {
    keyword: row.keyword,
    model: row.model,
    ideas: row.ideas_json ?? [],
    createdAt: row.created_at,
  };
}

export async function generateIdeasForNiche(input: {
  userId: string;
  keyword: string;
}): Promise<GeneratedIdeaSet> {
  const normalizedKeyword = normalizeKeyword(input.keyword);
  if (!normalizedKeyword) throw new Error("Keyword is required");
  if (!anthropicApiKey()) throw new Error("ANTHROPIC_API_KEY missing");

  const snapshot = await getLatestNicheSnapshot(input.keyword);
  if (!snapshot || snapshot.results.length === 0) {
    throw new Error("No cached niche snapshot available for this keyword");
  }

  const references = [...snapshot.results]
    .sort((a, b) => b.outlierScore - a.outlierScore)
    .slice(0, 30)
    .map(
      (video) =>
        `${clipText(video.title)} | ${video.category || "other"} | ${Math.round(video.outlierScore * 10) / 10}x outlier`,
    )
    .filter(Boolean);

  if (references.length < 10) {
    throw new Error("Not enough outlier examples available for this niche");
  }

  const text = await requestAnthropicText({
    prompt: buildPrompt(snapshot.keyword, references),
    maxTokens: 1200,
    temperature: 0.7,
  });

  const ideas = parseIdeaList(text);
  if (ideas.length < 10) {
    throw new Error("Anthropic returned fewer than 10 usable ideas");
  }

  return storeIdeaGeneration({
    userId: input.userId,
    keyword: snapshot.keyword,
    ideas: ideas.slice(0, 10),
    createdAt: new Date().toISOString(),
  });
}
