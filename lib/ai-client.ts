import { createHash } from "crypto";
import { checkAiBudget, recordAiUsage } from "./budget-cap";
import { getSupabaseAdmin } from "./supabase";

export interface AiJsonOptions {
  job: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  estimatedUsd?: number;
  extraBody?: Record<string, unknown>;
  cacheTtlSeconds?: number;
}

export interface AiJsonResult<T> {
  data: T;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cached?: boolean;
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

interface ProviderConfig {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModel?: string;
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

function resolveProviders(): ProviderConfig[] {
  const providersEnv = process.env.AI_PROVIDERS?.trim();
  const names = providersEnv
    ? providersEnv.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  const base = aiConfig();
  const primaryConfig: ProviderConfig | null = base.apiKey
    ? {
        name: base.provider,
        apiKey: base.apiKey,
        baseUrl: base.baseUrl,
        model: base.model,
        fallbackModel: base.fallbackModel,
      }
    : null;

  if (!names) {
    return primaryConfig ? [primaryConfig] : [];
  }

  return names.flatMap((name): ProviderConfig[] => {
    if (name === "cached") return [];
    if (name === base.provider && primaryConfig) return [primaryConfig];
    const apiKey =
      name === "openrouter"
        ? process.env.OPENROUTER_API_KEY?.trim()
        : process.env.AI_API_KEY?.trim();
    if (!apiKey) return [];
    return [
      {
        name,
        apiKey,
        baseUrl: process.env.AI_BASE_URL?.trim() || base.baseUrl,
        model: base.model,
        fallbackModel: base.fallbackModel,
      },
    ];
  });
}

function promptHash(system: string, user: string): string {
  return createHash("sha256").update(`${system}\n\n${user}`).digest("hex");
}

async function readCache(hash: string): Promise<unknown | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;
  const { data } = await client
    .from("ai_response_cache")
    .select("result_json")
    .eq("prompt_hash", hash)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? (data.result_json as unknown) : null;
}

async function writeCache(
  hash: string,
  job: string,
  result: unknown,
  ttlSeconds: number,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await client
    .from("ai_response_cache")
    .insert({ prompt_hash: hash, job, result_json: result, expires_at: expiresAt });
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

async function callProvider(
  provider: ProviderConfig,
  options: AiJsonOptions,
): Promise<{ model: string; result: OpenAiCompatibleResponse; text: string }> {
  const tryModel = async (model: string) => {
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

    const response = await fetch(`${normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const result = (await response.json()) as OpenAiCompatibleResponse;
    if (!response.ok) {
      const detail = result.error?.message ? ` - ${result.error.message}` : "";
      throw new Error(`AI request failed [${provider.name}/${model}]: ${response.status}${detail}`);
    }

    return { model, result, text: result.choices?.[0]?.message?.content ?? "" };
  };

  const fallback =
    provider.fallbackModel && provider.fallbackModel !== provider.model
      ? provider.fallbackModel
      : undefined;

  try {
    return await tryModel(provider.model);
  } catch (primaryError) {
    if (!fallback) throw primaryError;
    console.warn("[ai] primary model failed, trying fallback", {
      provider: provider.name,
      primaryModel: provider.model,
      fallbackModel: fallback,
      message: primaryError instanceof Error ? primaryError.message : String(primaryError),
    });
    return await tryModel(fallback);
  }
}

export async function generateAiJson<T>(options: AiJsonOptions): Promise<AiJsonResult<T>> {
  const budget = await checkAiBudget(options.estimatedUsd ?? 0.01);
  if (!budget.allowed) {
    throw new Error(budget.reason ?? "AI budget cap reached");
  }

  const providers = resolveProviders();
  const hash = promptHash(options.system, options.user);
  const cacheTtl = options.cacheTtlSeconds ?? 7 * 24 * 3600;
  const useCache = process.env.AI_PROVIDERS?.includes("cached") ?? false;

  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const completion = await callProvider(provider, options);
      const data = extractJson(completion.text) as T;

      if (useCache) {
        writeCache(hash, options.job, data, cacheTtl).catch(() => {});
      }

      const inputTokens =
        completion.result.usage?.prompt_tokens ?? completion.result.usage?.input_tokens ?? 0;
      const outputTokens =
        completion.result.usage?.completion_tokens ?? completion.result.usage?.output_tokens ?? 0;
      const costUsd = await recordAiUsage({
        provider: provider.name,
        model: completion.model,
        job: options.job,
        inputTokens,
        outputTokens,
        metadata: { baseUrl: provider.baseUrl, primaryModel: provider.model },
      });

      return { data, provider: provider.name, model: completion.model, inputTokens, outputTokens, costUsd };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${provider.name}] ${msg}`);
      console.warn(`[ai] provider ${provider.name} failed:`, msg);
    }
  }

  // All live providers failed — try cache
  if (useCache) {
    const cached = await readCache(hash);
    if (cached) {
      console.warn("[ai] all providers failed, serving cached response", { job: options.job });
      return {
        data: cached as T,
        provider: "cached",
        model: "cached",
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        cached: true,
      };
    }
  }

  throw new Error(`All AI providers failed for job ${options.job}: ${errors.join("; ")}`);
}
