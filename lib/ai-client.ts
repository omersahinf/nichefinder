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

export function aiConfig(): { provider: string; apiKey?: string; baseUrl: string; model: string } {
  return {
    provider: process.env.AI_PROVIDER?.trim() || "openai_compatible",
    apiKey:
      process.env.AI_API_KEY?.trim() ||
      process.env.DASHSCOPE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim(),
    baseUrl:
      process.env.AI_BASE_URL?.trim() || "https://coding-intl.dashscope.aliyuncs.com/v1",
    model: process.env.AI_MODEL?.trim() || "qwen3-max-2026-01-23",
  };
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
  return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function generateAiJson<T>(options: AiJsonOptions): Promise<AiJsonResult<T>> {
  const config = aiConfig();
  if (!config.apiKey) throw new Error("AI_API_KEY, DASHSCOPE_API_KEY, or GEMINI_API_KEY missing");

  const budget = await checkAiBudget(options.estimatedUsd ?? 0.01);
  if (!budget.allowed) {
    throw new Error(budget.reason ?? "AI budget cap reached");
  }

  const body = {
    model: config.model,
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
    throw new Error(`AI request failed: ${response.status}${detail}`);
  }

  const text = result.choices?.[0]?.message?.content ?? "";
  const inputTokens = result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? 0;
  const outputTokens = result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0;
  const costUsd = await recordAiUsage({
    provider: config.provider,
    model: config.model,
    job: options.job,
    inputTokens,
    outputTokens,
    metadata: { baseUrl: config.baseUrl },
  });

  return {
    data: extractJson(text) as T,
    provider: config.provider,
    model: config.model,
    inputTokens,
    outputTokens,
    costUsd,
  };
}
