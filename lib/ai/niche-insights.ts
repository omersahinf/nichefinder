import { getLatestNicheSnapshot } from "../cache";
import { normalizeKeyword } from "../niche-utils";
import { computeSaturation } from "../saturation";
import type { EnrichedVideo } from "../search-types";
import { getSupabaseAdmin } from "../supabase";
import { anthropicApiKey, anthropicModel, requestAnthropicText } from "./anthropic";

const AI_INSIGHT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface AiNicheInsightRow {
  normalized_keyword: string;
  keyword: string;
  model: string;
  insight_json: StoredNicheInsightPayload | null;
  snapshot_fetched_at: string | null;
  sample_size: number | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface TrendSummary {
  rising: number;
  flat: number;
  falling: number;
  averageGrowth30d: number | null;
}

interface StoredNicheInsightPayload {
  analysis: string[];
  saturationLevel: "low" | "medium" | "high";
  topCategories: string[];
  trendSummary: TrendSummary;
}

export interface NicheInsight {
  keyword: string;
  model: string;
  analysis: string[];
  sampleSize: number;
  saturationLevel: "low" | "medium" | "high";
  topCategories: string[];
  trendSummary: TrendSummary;
  snapshotFetchedAt?: string;
  generatedAt: string;
  expiresAt: string;
  cached: boolean;
  stale: boolean;
}

function clipText(value: string, maxLength = 120): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) return trimmed;
  return trimmed.slice(0, maxLength - 1).trimEnd() + "...";
}

function categorySummary(videos: EnrichedVideo[]): string[] {
  return Array.from(
    videos.reduce((map, video) => {
      const category = (video.category || "other").trim().toLowerCase();
      map.set(category, (map.get(category) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, count]) => `${category} (${count})`);
}

function buildTrendSummary(videos: EnrichedVideo[]): TrendSummary {
  const seen = new Set<string>();
  let rising = 0;
  let flat = 0;
  let falling = 0;
  const growthValues: number[] = [];

  for (const video of videos) {
    const trend = video.channelTrend;
    if (!trend || trend.sampleSize < 4 || seen.has(video.channelId)) continue;

    seen.add(video.channelId);
    growthValues.push(trend.growth30d);

    if (trend.direction === "rising") rising += 1;
    if (trend.direction === "flat") flat += 1;
    if (trend.direction === "falling") falling += 1;
  }

  const averageGrowth30d =
    growthValues.length > 0
      ? growthValues.reduce((sum, value) => sum + value, 0) / growthValues.length
      : null;

  return {
    rising,
    flat,
    falling,
    averageGrowth30d,
  };
}

function promptForNicheInsight(input: {
  keyword: string;
  sampleSize: number;
  snapshotFetchedAt?: string;
  topCategories: string[];
  topTitles: string[];
  saturation: NonNullable<ReturnType<typeof computeSaturation>>;
  trendSummary: TrendSummary;
  totalEstimatedRevenue: number;
}): string {
  const trendLine =
    input.trendSummary.averageGrowth30d === null
      ? "Trend data: limited"
      : `Trend data: ${input.trendSummary.rising} rising, ${input.trendSummary.flat} flat, ${input.trendSummary.falling} falling channels, avg growth ${(input.trendSummary.averageGrowth30d * 100).toFixed(0)}% over 30d`;

  return [
    "You are analyzing a YouTube niche dataset for product research.",
    "Return strict JSON with this schema only:",
    '{"analysis":["Sentence 1","Sentence 2","Sentence 3","Sentence 4","Sentence 5"]}',
    "Rules:",
    "- Exactly 5 sentences.",
    "- Each sentence must be concise, factual, and written in English.",
    "- Cover: why the niche is working, who the audience likely is, what title/package pattern is visible, how crowded the niche looks, and one content opportunity.",
    "- Ground claims only in the supplied data. If evidence is weak, say so.",
    "",
    `Keyword: ${input.keyword}`,
    `Sample size: ${input.sampleSize} cached videos`,
    input.snapshotFetchedAt ? `Snapshot fetched at: ${input.snapshotFetchedAt}` : "",
    `Saturation: ${input.saturation.label} (${input.saturation.hint})`,
    `Median subscribers: ${Math.round(input.saturation.medianSubs)}`,
    `Average outlier score: ${input.saturation.avgOutlier.toFixed(1)}x`,
    `Small channel ratio: ${(input.saturation.smallChannelRatio * 100).toFixed(0)}%`,
    `Small channel outlier ratio: ${(input.saturation.smallOutlierRatio * 100).toFixed(0)}%`,
    `Top categories: ${input.topCategories.join(", ") || "n/a"}`,
    trendLine,
    `Estimated revenue across top 10 videos: $${Math.round(input.totalEstimatedRevenue)}`,
    "Top outlier titles:",
    ...input.topTitles.map((title, index) => `${index + 1}. ${title}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/```json|```/g, "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^[-*\d.\s]+/, "").trim())
    .filter(Boolean);
}

function normalizeAnalysis(input: unknown): string[] {
  const values = Array.isArray(input) ? input : [];
  const normalized = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  if (normalized.length >= 5) return normalized.slice(0, 5);

  const expanded = normalized.flatMap((sentence) => splitIntoSentences(sentence));
  return expanded.slice(0, 5);
}

function parseAnthropicAnalysis(text: string): string[] {
  const cleaned = text.trim();

  try {
    const parsed = JSON.parse(cleaned) as { analysis?: unknown };
    const normalized = normalizeAnalysis(parsed.analysis);
    if (normalized.length > 0) return normalized;
  } catch {}

  return normalizeAnalysis(splitIntoSentences(cleaned));
}

async function loadCachedNicheInsight(keyword: string): Promise<NicheInsight | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const { data, error } = await client
    .from("ai_niche_insights")
    .select(
      "normalized_keyword,keyword,model,insight_json,snapshot_fetched_at,sample_size,expires_at,created_at,updated_at",
    )
    .eq("normalized_keyword", normalizeKeyword(keyword))
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as AiNicheInsightRow;
  const payload = row.insight_json;
  if (!payload || !Array.isArray(payload.analysis) || payload.analysis.length === 0) {
    return null;
  }

  return {
    keyword: row.keyword,
    model: row.model,
    analysis: payload.analysis,
    sampleSize: row.sample_size ?? 0,
    saturationLevel: payload.saturationLevel,
    topCategories: payload.topCategories ?? [],
    trendSummary: payload.trendSummary ?? {
      rising: 0,
      flat: 0,
      falling: 0,
      averageGrowth30d: null,
    },
    snapshotFetchedAt: row.snapshot_fetched_at ?? undefined,
    generatedAt: row.updated_at || row.created_at,
    expiresAt: row.expires_at,
    cached: true,
    stale: new Date(row.expires_at).getTime() <= Date.now(),
  };
}

async function storeNicheInsight(insight: Omit<NicheInsight, "cached" | "stale">): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  const { error } = await client.from("ai_niche_insights").upsert(
    {
      normalized_keyword: normalizeKeyword(insight.keyword),
      keyword: insight.keyword,
      model: insight.model,
      insight_json: {
        analysis: insight.analysis,
        saturationLevel: insight.saturationLevel,
        topCategories: insight.topCategories,
        trendSummary: insight.trendSummary,
      },
      snapshot_fetched_at: insight.snapshotFetchedAt ?? null,
      sample_size: insight.sampleSize,
      expires_at: insight.expiresAt,
      updated_at: insight.generatedAt,
    },
    { onConflict: "normalized_keyword" },
  );

  if (error) throw error;
}

async function requestAnthropicAnalysis(prompt: string): Promise<string[]> {
  const text = await requestAnthropicText({
    prompt,
    maxTokens: 1000,
    temperature: 0.3,
  });
  const analysis = parseAnthropicAnalysis(text);
  if (analysis.length === 0) throw new Error("Anthropic returned no usable analysis");

  return analysis;
}

export async function getNicheInsight(
  keyword: string,
  options?: { forceRefresh?: boolean },
): Promise<NicheInsight | null> {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return null;

  const cached = await loadCachedNicheInsight(keyword);
  if (cached && !options?.forceRefresh && !cached.stale) {
    return cached;
  }

  const snapshot = await getLatestNicheSnapshot(keyword);
  if (!snapshot || snapshot.results.length === 0) {
    return cached;
  }

  const saturation = computeSaturation(snapshot.results);
  if (!saturation) return cached;

  if (!anthropicApiKey()) {
    if (cached) return cached;
    throw new Error("ANTHROPIC_API_KEY missing");
  }

  const topVideos = [...snapshot.results]
    .sort((a, b) => b.outlierScore - a.outlierScore)
    .slice(0, 20);
  const topCategories = categorySummary(snapshot.results);
  const trendSummary = buildTrendSummary(snapshot.results);
  const totalEstimatedRevenue = topVideos
    .slice(0, 10)
    .reduce((sum, video) => sum + (video.estimatedRevenueUsd ?? 0), 0);

  const prompt = promptForNicheInsight({
    keyword: snapshot.keyword,
    sampleSize: snapshot.results.length,
    snapshotFetchedAt: snapshot.fetchedAt,
    topCategories,
    topTitles: topVideos.map(
      (video) =>
        `${clipText(video.title)} | ${video.channelTitle} | ${Math.round(video.outlierScore * 10) / 10}x outlier | ${Math.round(video.views)} views`,
    ),
    saturation,
    trendSummary,
    totalEstimatedRevenue,
  });

  const analysis = await requestAnthropicAnalysis(prompt);
  const generatedAt = new Date().toISOString();
  const insight: Omit<NicheInsight, "cached" | "stale"> = {
    keyword: snapshot.keyword,
    model: anthropicModel(),
    analysis,
    sampleSize: snapshot.results.length,
    saturationLevel: saturation.level,
    topCategories,
    trendSummary,
    snapshotFetchedAt: snapshot.fetchedAt,
    generatedAt,
    expiresAt: new Date(Date.now() + AI_INSIGHT_TTL_MS).toISOString(),
  };

  await storeNicheInsight(insight);

  return {
    ...insight,
    cached: false,
    stale: false,
  };
}
