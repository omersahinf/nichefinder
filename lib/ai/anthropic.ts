const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export function anthropicApiKey(): string {
  return process.env.ANTHROPIC_API_KEY?.trim() || "";
}

export function anthropicModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
}

export async function requestAnthropicText(input: {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicApiKey(),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: anthropicModel(),
      max_tokens: input.maxTokens ?? 1000,
      temperature: input.temperature ?? 0.3,
      messages: [{ role: "user", content: input.prompt }],
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | {
        content?: Array<{ type?: string; text?: string }>;
        error?: { message?: string };
      }
    | null;

  if (!response.ok) {
    throw new Error(data?.error?.message || "Anthropic request failed");
  }

  return (data?.content ?? [])
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
}
