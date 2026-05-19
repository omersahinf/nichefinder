import { checkAiBudget, recordAiUsage } from "./budget-cap";

export interface AiJsonOptions {
  job: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  estimatedUsd?: number;
  extraBody?: Record<string, unknown>;
}

export interface AiJsonResult<T> {
  data: T;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface OpenAiCompatibleResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    message?: string;
  };
}

export function aiConfig(): {
  provider: string;
  apiKey?: string;
  baseUrl: string;
  model: string;
  fallbackModel?: string;
} {
  const provider = process.env.AI_PROVIDER?.trim() || "openai_compatible";
  const apiKey =
    provider === "openrouter"
      ? process.env.OPENROUTER_API_KEY?.trim()
      : process.env.AI_API_KEY?.trim() ||
        process.env.OPENROUTER_API_KEY?.trim() ||
        process.env.DASHSCOPE_API_KEY?.trim() ||
        process.env.GEMINI_API_KEY?.trim();

  return {
    provider,
    apiKey,
    baseUrl:
      process.env.AI_BASE_URL?.trim() || "https://coding-intl.dashscope.aliyuncs.com/v1",
    model: process.env.AI_MODEL?.trim() || "qwen3.6-plus",
    fallbackModel: process.env.AI_FALLBACK_MODEL?.trim() || undefined,
  };
}

function parseCompletedKeywordObjects(jsonLike: string): unknown | null {
  const keywordIndex = jsonLike.indexOf('"keywords"');
  if (keywordIndex < 0) return null;

  const arrayStart = jsonLike.indexOf("[", keywordIndex);
  if (arrayStart < 0) return null;

  const objects: unknown[] = [];
  let inString = false;
  let escaped = false;
  let depth = 0;
  let objectStart = -1;

  for (let index = arrayStart + 1; index < jsonLike.length; index += 1) {
    const char = jsonLike[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === "{") {
      if (depth === 0) objectStart = index;
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0 && objectStart >= 0) {
        const objectText = jsonLike.slice(objectStart, index + 1);
        try {
          objects.push(JSON.parse(objectText) as unknown);
        } catch {
          // Skip malformed partial objects and keep any completed ones.
        }
        objectStart = -1;
      }
    }
  }

  return objects.length > 0 ? { keywords: objects } : null;
}

function parseJsonWithFallback(jsonText: string): unknown {
  try {
    return JSON.parse(jsonText) as unknown;
  } catch (error) {
    const commaRepaired = jsonText
      .replace(/}\s*{/g, "},{")
      .replace(/,\s*([}\]])/g, "$1");
    try {
      return JSON.parse(commaRepaired) as unknown;
    } catch {
      const completedKeywords = parseCompletedKeywordObjects(jsonText);
      if (completedKeywords) return completedKeywords;
      throw error;
    }
  }
}

function extractJson(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = starts.length > 0 ? Math.min(...starts) : -1;
  const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
  if (start < 0 || end <= start) {
    throw new Error("AI response did not include JSON");
  }
  return parseJsonWithFallback(trimmed.slice(start, end + 1));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function generateAiJson<T>(options: AiJsonOptions): Promise<AiJsonResult<T>> {
  const config = aiConfig();
  if (!config.apiKey) {
    throw new Error("AI_API_KEY, OPENROUTER_API_KEY, DASHSCOPE_API_KEY, or GEMINI_API_KEY missing");
  }

  const budget = await checkAiBudget(options.estimatedUsd ?? 0.01);
  if (!budget.allowed) {
    throw new Error(budget.reason ?? "AI budget cap reached");
  }

  const requestModel = async (
    model: string,
  ): Promise<{ model: string; result: OpenAiCompatibleResponse; text: string }> => {
    const body = {
      model,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: options.user },
      ],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      response_format: { type: "json_object" },
      ...options.extraBody,
    };

    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as OpenAiCompatibleResponse;
    if (!response.ok) {
      const detail = result.error?.message ? ` - ${result.error.message}` : "";
      throw new Error(`AI request failed for ${model}: ${response.status}${detail}`);
    }

    return {
      model,
      result,
      text: result.choices?.[0]?.message?.content ?? "",
    };
  };

  const fallbackModel =
    config.fallbackModel && config.fallbackModel !== config.model ? config.fallbackModel : undefined;

  let completion: { model: string; result: OpenAiCompatibleResponse; text: string };
  try {
    completion = await requestModel(config.model);
  } catch (error) {
    if (!fallbackModel) throw error;
    console.warn("[ai] primary model failed, retrying fallback", {
      primaryModel: config.model,
      fallbackModel,
      message: error instanceof Error ? error.message : String(error),
    });
    completion = await requestModel(fallbackModel);
  }

  let data: T;
  try {
    data = extractJson(completion.text) as T;
  } catch (error) {
    if (!fallbackModel || completion.model === fallbackModel) throw error;
    console.warn("[ai] primary model returned invalid JSON, retrying fallback", {
      primaryModel: completion.model,
      fallbackModel,
      message: error instanceof Error ? error.message : String(error),
    });
    completion = await requestModel(fallbackModel);
    data = extractJson(completion.text) as T;
  }

  const inputTokens = completion.result.usage?.prompt_tokens ?? completion.result.usage?.input_tokens ?? 0;
  const outputTokens =
    completion.result.usage?.completion_tokens ?? completion.result.usage?.output_tokens ?? 0;
  const costUsd = await recordAiUsage({
    provider: config.provider,
    model: completion.model,
    job: options.job,
    inputTokens,
    outputTokens,
    metadata: { baseUrl: config.baseUrl, primaryModel: config.model, fallbackModel },
  });

  return {
    data,
    provider: config.provider,
    model: completion.model,
    inputTokens,
    outputTokens,
    costUsd,
  };
}
