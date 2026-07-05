import { classifyVideoContent } from "./content-quality";
import { generateAiJson } from "./ai-client";
import { promoteToSeed } from "./cache";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import type { KeywordDiscoveryResult } from "./keyword-extraction";

const RECENT_DAYS = 90;
const MIN_OUTLIER = 3;
const MIN_VIEWS = 10_000;
const MIN_DURATION_SECONDS = 181;
const MAX_AI_CANDIDATES = 12;
const HIGH_VALUE_CATEGORIES = new Set(["finance", "business", "tech", "education", "health"]);

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "for",
  "from",
  "with",
  "without",
  "into",
  "onto",
  "about",
  "this",
  "that",
  "these",
  "those",
  "your",
  "you",
  "how",
  "why",
  "what",
  "when",
  "where",
  "who",
  "will",
  "can",
  "could",
  "would",
  "should",
  "really",
  "actually",
  "video",
  "videos",
  "watch",
  "new",
  "best",
  "top",
  "latest",
  "full",
  "official",
]);

const JUNK_KEYWORD_PARTS = [
  "shorts",
  "youtube shorts",
  "trailer",
  "teaser",
  "promo",
  "match highlights",
  "game highlights",
  "highlights",
  "live stream",
  "livestream",
  "watch live",
  "gameplay",
  "walkthrough",
  "let's play",
  "minecraft",
  "fortnite",
  "roblox",
  "movie clip",
  "movie review",
  "full episode",
  "tv show",
  "netflix",
  "celebrity",
  "red carpet",
  "breaking news",
  "election",
  "live score",
  "football",
  "soccer",
  "basketball",
  "baseball",
  "dodgers",
  "padres",
  "psg",
  "uefa",
  "champions league",
  "nba",
  "nfl",
  "mlb",
  "nhl",
  "ufc",
  "fifa",
  "wwe",
  "cricket",
  "ipl",
  "song",
  "music video",
  "official audio",
];

const TITLE_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "why {topic} disappeared", regex: /^why (.{3,80}) (?:disappeared|vanished|failed|collapsed)$/i },
  { label: "how {topic} works", regex: /^how (.{3,80}) (?:works|actually works)$/i },
  { label: "dark truth about {topic}", regex: /^(?:the )?dark truth about (?:the |a |an )?(.{3,80})$/i },
  { label: "why {topic} is so expensive", regex: /^why (.{3,80}) is so (?:expensive|dangerous|hard|profitable)$/i },
  { label: "inside {topic}", regex: /^inside (?:the )?(.{3,80})$/i },
  { label: "{topic} case study", regex: /^(.{3,80}) case study$/i },
  { label: "{topic} explained", regex: /^(.{3,80}) explained$/i },
  { label: "{topic} breakdown", regex: /^(.{3,80}) breakdown$/i },
];

interface VideoRow {
  youtube_id: string;
  channel_id: string;
  channel_title: string | null;
  title: string;
  views: number | string | null;
  outlier_score: number | string | null;
  published_at: string | null;
  duration_seconds: number | string | null;
  tags: string[] | null;
}

interface ChannelRow {
  youtube_id: string;
  title: string | null;
  subs: number | string | null;
  video_count: number | string | null;
  category: string | null;
  tags?: string[] | null;
  is_monetized: boolean | null;
  content_class?: string | null;
  junk_video_ratio?: number | string | null;
}

export interface NicheGraphExample {
  videoId: string;
  channelId: string;
  channelTitle: string;
  channelSubs: number;
  title: string;
  views: number;
  outlierScore: number;
  publishedAt: string | null;
  category: string | null;
  pattern: string | null;
}

export interface NicheCandidateForScoring {
  keyword: string;
  occurrences: number;
  channelCount: number;
  examples: NicheGraphExample[];
}

interface CandidateAccumulator {
  keyword: string;
  occurrences: number;
  examples: NicheGraphExample[];
  channels: Set<string>;
  patterns: Set<string>;
  categories: Set<string>;
}

interface ScoredCandidate {
  keyword: string;
  score: number;
  status: "watch" | "accepted" | "rejected";
  evidence: {
    keyword: string;
    occurrences: number;
    channelCount: number;
    examples: NicheGraphExample[];
    patterns: string[];
    categories: string[];
    reasons: string[];
    penalties: string[];
  };
}

interface AiJudgeResponse {
  candidates?: Array<{
    keyword?: string;
    verdict?: "accept" | "watch" | "reject";
    canonical_keyword?: string;
    adjacent_keywords?: string[];
    reject_reason?: string;
  }>;
}

interface CandidateVerdict {
  verdict: "accept" | "watch" | "reject";
  canonicalKeyword: string;
  adjacentKeywords: string[];
  rejectReason?: string;
  provider?: string;
  model?: string;
  costUsd?: number;
}

async function logDiscovery(
  job: string,
  candidatesFound: number,
  candidatesAdded: number,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  const { error } = await client
    .from("keyword_discovery_log")
    .insert({
      job,
      candidates_found: candidatesFound,
      candidates_added: candidatesAdded,
      metadata,
    });
  if (error) throw error;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeNicheKeyword(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s'-]/g, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasJunkKeywordSignal(value: string): boolean {
  const normalized = normalizeNicheKeyword(value);
  if (!normalized) return true;
  if (/\bvs\b/.test(normalized)) return true;
  return JUNK_KEYWORD_PARTS.some((part) => normalized.includes(part));
}

function isSeedableKeyword(value: string): boolean {
  const keyword = normalizeNicheKeyword(value);
  const words = keyword.split(" ").filter(Boolean);
  if (keyword.length < 4 || words.length < 2 || words.length > 5) return false;
  if (/^\d+$/.test(keyword) || hasJunkKeywordSignal(keyword)) return false;
  if (words.every((word) => STOPWORDS.has(word))) return false;

  const classifier = classifyVideoContent({
    title: keyword,
    description: "",
    tags: [],
    duration: "PT10M",
    durationSeconds: 600,
  });
  return classifier.contentClass === "niche";
}

function tokenize(value: string): string[] {
  return normalizeNicheKeyword(value)
    .split(" ")
    .filter((word) => word.length > 1 && !STOPWORDS.has(word));
}

function phraseFromTag(value: string): string | null {
  const keyword = normalizeNicheKeyword(value);
  const words = keyword.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4) return null;
  return isSeedableKeyword(keyword) ? keyword : null;
}

function extractTitlePattern(title: string): { pattern: string; topic: string } | null {
  const normalized = normalizeNicheKeyword(title);
  for (const item of TITLE_PATTERNS) {
    const match = normalized.match(item.regex);
    const topic = normalizeNicheKeyword(match?.[1] ?? "");
    if (topic && isSeedableKeyword(topic)) return { pattern: item.label, topic };
  }
  return null;
}

function extractTopicPhrases(video: VideoRow, channel: ChannelRow): Array<{ keyword: string; pattern: string | null }> {
  const phrases = new Map<string, string | null>();

  const pattern = extractTitlePattern(video.title);
  if (pattern) phrases.set(pattern.topic, pattern.pattern);

  const titleTokens = tokenize(video.title);
  for (let size = 2; size <= 4; size += 1) {
    for (let index = 0; index <= titleTokens.length - size; index += 1) {
      const phrase = titleTokens.slice(index, index + size).join(" ");
      if (isSeedableKeyword(phrase)) phrases.set(phrase, phrases.get(phrase) ?? null);
    }
  }

  for (const tag of [...(video.tags ?? []), ...(channel.tags ?? [])]) {
    const phrase = phraseFromTag(tag);
    if (phrase) phrases.set(phrase, phrases.get(phrase) ?? null);
  }

  const category = phraseFromTag(channel.category ?? "");
  if (category) phrases.set(category, phrases.get(category) ?? null);

  return [...phrases.entries()].map(([keyword, itemPattern]) => ({ keyword, pattern: itemPattern }));
}

function viewsPerDay(example: NicheGraphExample): number {
  const published = example.publishedAt ? new Date(example.publishedAt).getTime() : NaN;
  const ageDays = Number.isFinite(published) ? Math.max(1, (Date.now() - published) / 86_400_000) : RECENT_DAYS;
  return example.views / ageDays;
}

export function scoreNicheCandidate(candidate: NicheCandidateForScoring): {
  score: number;
  reasons: string[];
  penalties: string[];
} {
  const reasons: string[] = [];
  const penalties: string[] = [];
  const examples = candidate.examples;
  const smallExamples = examples.filter((example) => example.channelSubs <= 250_000);
  const avgSmallOutlier =
    smallExamples.reduce((sum, example) => sum + example.outlierScore, 0) /
    Math.max(smallExamples.length, 1);
  const smallOutlierScore = clamp(avgSmallOutlier * 6 + smallExamples.length * 2, 0, 35);
  if (smallOutlierScore >= 22) reasons.push("small_channel_outliers");

  const repeatabilityScore = clamp((candidate.channelCount - 1) * 7, 0, 20);
  if (candidate.channelCount >= 3) reasons.push("multi_channel_repeatable");

  const patternExamples = examples.filter((example) => example.pattern);
  const patternScore = clamp(patternExamples.length * 5, 0, 15);
  if (patternScore >= 5) reasons.push("clean_title_pattern");

  const highValueCount = examples.filter((example) => HIGH_VALUE_CATEGORIES.has(example.category ?? "")).length;
  const monetizationScore = examples.length > 0 ? clamp((highValueCount / examples.length) * 10, 0, 10) : 0;
  if (monetizationScore >= 5) reasons.push("monetizable_category");

  const velocity = examples.reduce((sum, example) => sum + viewsPerDay(example), 0) / Math.max(examples.length, 1);
  const recencyScore = clamp(velocity / 2_000, 0, 10);
  if (recencyScore >= 4) reasons.push("recent_velocity");

  const megaExamples = examples.filter((example) => example.channelSubs >= 1_000_000);
  const cleanChannelScore = clamp(10 - (megaExamples.length / Math.max(examples.length, 1)) * 8, 0, 10);
  if (cleanChannelScore >= 7) reasons.push("channel_quality");

  let score =
    smallOutlierScore +
    repeatabilityScore +
    patternScore +
    monetizationScore +
    recencyScore +
    cleanChannelScore;

  if (hasJunkKeywordSignal(candidate.keyword)) {
    score -= 45;
    penalties.push("junk_keyword_signal");
  }
  if (candidate.channelCount < 2) {
    score -= 25;
    penalties.push("single_channel_dependency");
  }
  if (megaExamples.length / Math.max(examples.length, 1) > 0.55) {
    score -= 18;
    penalties.push("mega_channel_dominated");
  }
  if (/\b(celebrity|news|sports|show|game|live|movie)\b/i.test(candidate.keyword)) {
    score -= 20;
    penalties.push("broad_media_keyword");
  }

  return {
    score: Math.round(clamp(score, 0, 100)),
    reasons,
    penalties,
  };
}

function evidenceExample(video: VideoRow, channel: ChannelRow, pattern: string | null): NicheGraphExample {
  return {
    videoId: video.youtube_id,
    channelId: video.channel_id,
    channelTitle: video.channel_title ?? channel.title ?? "",
    channelSubs: Number(channel.subs ?? 0),
    title: video.title,
    views: Number(video.views ?? 0),
    outlierScore: Number(video.outlier_score ?? 0),
    publishedAt: video.published_at,
    category: channel.category,
    pattern,
  };
}

function buildCandidates(videos: VideoRow[], channels: Map<string, ChannelRow>): ScoredCandidate[] {
  const cleanOutlierCounts = new Map<string, number>();
  for (const video of videos) {
    cleanOutlierCounts.set(video.channel_id, (cleanOutlierCounts.get(video.channel_id) ?? 0) + 1);
  }

  const candidates = new Map<string, CandidateAccumulator>();
  for (const video of videos) {
    const channel = channels.get(video.channel_id);
    if (!channel) continue;
    if (channel.content_class === "junk") continue;
    if (Number(channel.junk_video_ratio ?? 0) >= 0.25) continue;
    if ((cleanOutlierCounts.get(video.channel_id) ?? 0) < 2) continue;

    for (const phrase of extractTopicPhrases(video, channel)) {
      const current = candidates.get(phrase.keyword) ?? {
        keyword: phrase.keyword,
        occurrences: 0,
        examples: [],
        channels: new Set<string>(),
        patterns: new Set<string>(),
        categories: new Set<string>(),
      };
      current.occurrences += 1;
      current.channels.add(video.channel_id);
      if (phrase.pattern) current.patterns.add(phrase.pattern);
      if (channel.category) current.categories.add(channel.category);
      if (current.examples.length < 12) {
        current.examples.push(evidenceExample(video, channel, phrase.pattern));
      }
      candidates.set(phrase.keyword, current);
    }
  }

  return [...candidates.values()]
    .filter((candidate) => candidate.channels.size >= 2)
    .map((candidate) => {
      const scored = scoreNicheCandidate({
        keyword: candidate.keyword,
        occurrences: candidate.occurrences,
        channelCount: candidate.channels.size,
        examples: candidate.examples,
      });
      const status: ScoredCandidate["status"] =
        scored.score >= 70 ? "accepted" : scored.score >= 50 ? "watch" : "rejected";
      return {
        keyword: candidate.keyword,
        score: scored.score,
        status,
        evidence: {
          keyword: candidate.keyword,
          occurrences: candidate.occurrences,
          channelCount: candidate.channels.size,
          examples: candidate.examples
            .sort((a, b) => b.outlierScore - a.outlierScore || b.views - a.views)
            .slice(0, 8),
          patterns: [...candidate.patterns],
          categories: [...candidate.categories],
          reasons: scored.reasons,
          penalties: scored.penalties,
        },
      };
    })
    .sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword))
    .slice(0, 120);
}

function hasAiKey(): boolean {
  return Boolean(
    process.env.AI_API_KEY?.trim() ||
      process.env.OPENROUTER_API_KEY?.trim() ||
      process.env.DASHSCOPE_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim(),
  );
}

function deterministicVerdict(candidate: ScoredCandidate, reason: string): CandidateVerdict {
  if (candidate.score < 50 || hasJunkKeywordSignal(candidate.keyword)) {
    return {
      verdict: "reject",
      canonicalKeyword: candidate.keyword,
      adjacentKeywords: [],
      rejectReason: candidate.evidence.penalties[0] ?? reason,
    };
  }
  return {
    verdict: candidate.score >= 70 ? "accept" : "watch",
    canonicalKeyword: candidate.keyword,
    adjacentKeywords: [],
    rejectReason: candidate.score >= 70 ? undefined : reason,
  };
}

async function judgeCandidates(candidates: ScoredCandidate[]): Promise<Map<string, CandidateVerdict>> {
  const verdicts = new Map<string, CandidateVerdict>();
  const needsAi = candidates.filter((candidate) => candidate.score >= 50).slice(0, MAX_AI_CANDIDATES);

  for (const candidate of candidates) {
    verdicts.set(candidate.keyword, deterministicVerdict(candidate, "deterministic_score"));
  }
  if (needsAi.length === 0 || !hasAiKey()) return verdicts;

  try {
    const ai = await generateAiJson<AiJudgeResponse>({
      job: "niche-graph-discovery",
      maxTokens: 2400,
      temperature: 0.25,
      estimatedUsd: 0.02,
      extraBody: {
        reasoning_effort: "low",
        extra_body: { enable_thinking: false },
      },
      system:
        "You judge YouTube creator niche candidates from evidence only. Return compact JSON only. Reject junk, broad media, sports, movies, shows, gameplay, live, celebrity, news, shorts, trailers, and one-off channel artifacts.",
      user: JSON.stringify({
        task: "For each candidate, return {candidates:[{keyword,verdict,canonical_keyword,adjacent_keywords,reject_reason}]}. Adjacent keywords must be very close evidence-backed neighbors, max 3 per accepted/watch candidate.",
        constraints: [
          "Do not invent unrelated new niches.",
          "Accept only evergreen creator niches repeatable by small or medium channels.",
          "Use reject when evidence is junk, single-channel dependent, event/news/sports/movie/game/live/show/celebrity driven, or too vague.",
          "canonical_keyword should be 2-5 English words.",
          "adjacent_keywords must pass the same cleanliness standard.",
        ],
        candidates: needsAi.map((candidate) => ({
          keyword: candidate.keyword,
          score: candidate.score,
          channelCount: candidate.evidence.channelCount,
          reasons: candidate.evidence.reasons,
          penalties: candidate.evidence.penalties,
          examples: candidate.evidence.examples.slice(0, 5).map((example) => ({
            title: example.title,
            channelSubs: example.channelSubs,
            views: example.views,
            outlierScore: example.outlierScore,
            category: example.category,
            pattern: example.pattern,
          })),
        })),
      }),
    });

    for (const item of ai.data.candidates ?? []) {
      const key = normalizeNicheKeyword(item.keyword ?? "");
      const source = needsAi.find((candidate) => candidate.keyword === key);
      if (!source) continue;
      const verdict = item.verdict === "accept" || item.verdict === "watch" || item.verdict === "reject"
        ? item.verdict
        : "watch";
      const canonicalKeyword = normalizeNicheKeyword(item.canonical_keyword ?? source.keyword);
      verdicts.set(source.keyword, {
        verdict,
        canonicalKeyword: isSeedableKeyword(canonicalKeyword) ? canonicalKeyword : source.keyword,
        adjacentKeywords: (item.adjacent_keywords ?? [])
          .map(normalizeNicheKeyword)
          .filter((keyword, index, arr) => arr.indexOf(keyword) === index && isSeedableKeyword(keyword))
          .slice(0, 3),
        rejectReason: item.reject_reason?.slice(0, 200),
        provider: ai.provider,
        model: ai.model,
        costUsd: ai.costUsd,
      });
    }
  } catch (error) {
    console.warn("[niche-graph-discovery] AI judge skipped", error);
  }

  return verdicts;
}

async function existingKeywords(): Promise<Set<string>> {
  const client = getSupabaseAdmin();
  if (!client) return new Set();
  const { data, error } = await client.from("seed_keywords").select("keyword");
  if (error) throw error;
  return new Set(((data ?? []) as Array<{ keyword: string | null }>).flatMap((row) => row.keyword ? [normalizeNicheKeyword(row.keyword)] : []));
}

async function promoteKeywords(
  candidates: ScoredCandidate[],
  verdicts: Map<string, CandidateVerdict>,
): Promise<{ promotedKeywords: number; adjacentAdded: number }> {
  const client = getSupabaseAdmin();
  if (!client) return { promotedKeywords: 0, adjacentAdded: 0 };

  const existing = await existingKeywords();
  const rows: Array<{
    keyword: string;
    category: string | null;
    priority: number;
    source: string;
    kind: "canonical" | "adjacent";
  }> = [];

  for (const candidate of candidates) {
    const verdict = verdicts.get(candidate.keyword) ?? deterministicVerdict(candidate, "missing_verdict");
    if (candidate.score < 70 || verdict.verdict !== "accept") continue;

    const category = candidate.evidence.categories[0] ?? null;
    const canonical = verdict.canonicalKeyword;
    if (!existing.has(canonical) && isSeedableKeyword(canonical)) {
      rows.push({
        keyword: canonical,
        category,
        priority: clamp(Math.round(candidate.score), 65, 90),
        source: "niche_graph_ai",
        kind: "canonical",
      });
      existing.add(canonical);
    }

    for (const adjacent of verdict.adjacentKeywords) {
      if (existing.has(adjacent) || !isSeedableKeyword(adjacent)) continue;
      rows.push({
        keyword: adjacent,
        category,
        priority: clamp(Math.round(candidate.score - 10), 55, 80),
        source: "niche_graph_ai",
        kind: "adjacent",
      });
      existing.add(adjacent);
    }
  }

  if (rows.length === 0) return { promotedKeywords: 0, adjacentAdded: 0 };

  const insertRows = rows.map(({ kind, ...row }) => {
    void kind;
    return row;
  });
  const { data, error } = await client
    .from("seed_keywords")
    .upsert(insertRows, { onConflict: "keyword", ignoreDuplicates: true })
    .select("keyword");
  if (error) throw error;

  const inserted = new Set(((data ?? []) as Array<{ keyword: string }>).map((row) => normalizeNicheKeyword(row.keyword)));
  return {
    promotedKeywords: rows.filter((row) => inserted.has(normalizeNicheKeyword(row.keyword)) && row.kind === "canonical").length,
    adjacentAdded: rows.filter((row) => inserted.has(normalizeNicheKeyword(row.keyword)) && row.kind === "adjacent").length,
  };
}

async function promoteChannels(
  candidates: ScoredCandidate[],
  verdicts: Map<string, CandidateVerdict>,
): Promise<number> {
  const channelScores = new Map<string, number>();
  for (const candidate of candidates) {
    const verdict = verdicts.get(candidate.keyword);
    if (candidate.score < 70 || verdict?.verdict !== "accept") continue;
    const counts = new Map<string, number>();
    for (const example of candidate.evidence.examples) {
      if (example.channelSubs >= 1_000_000) continue;
      counts.set(example.channelId, (counts.get(example.channelId) ?? 0) + 1);
    }
    for (const [channelId, count] of counts) {
      if (count < 2) continue;
      channelScores.set(channelId, Math.max(channelScores.get(channelId) ?? 0, candidate.score));
    }
  }

  const rows = [...channelScores.entries()].slice(0, 75);
  if (rows.length === 0) return 0;
  await Promise.all(
    rows.map(([channelId, score]) =>
      promoteToSeed([channelId], "niche_graph_ai", clamp(Math.round(score), 50, 90)),
    ),
  );
  return rows.length;
}

async function upsertCandidateLifecycle(
  candidates: ScoredCandidate[],
  verdicts: Map<string, CandidateVerdict>,
): Promise<{ rejected: number; watched: number; accepted: number; promoted: number }> {
  const client = getSupabaseAdmin();
  if (!client || candidates.length === 0) return { rejected: 0, watched: 0, accepted: 0, promoted: 0 };

  const now = new Date().toISOString();
  const rowsByKeyword = new Map<string, {
    canonical_keyword: string;
    source: string;
    score: number;
    status: string;
    evidence: ScoredCandidate["evidence"];
    ai_verdict: CandidateVerdict;
    reject_reason: string | null;
    evaluated_at: string;
    promoted_at: string | null;
    updated_at: string;
  }>();

  for (const candidate of candidates) {
    const verdict = verdicts.get(candidate.keyword) ?? deterministicVerdict(candidate, "missing_verdict");
    const isPromoted = candidate.score >= 70 && verdict.verdict === "accept";
    const status =
      verdict.verdict === "reject" || candidate.score < 50
        ? "rejected"
        : isPromoted
          ? "promoted"
          : verdict.verdict === "accept"
          ? "accepted"
          : "watch";
    const row = {
      canonical_keyword: verdict.canonicalKeyword,
      source: "niche_graph",
      score: candidate.score,
      status,
      evidence: candidate.evidence,
      ai_verdict: verdict,
      reject_reason: status === "rejected" ? verdict.rejectReason ?? candidate.evidence.penalties[0] ?? "low_score" : null,
      evaluated_at: now,
      promoted_at: status === "promoted" ? now : null,
      updated_at: now,
    };
    const existing = rowsByKeyword.get(row.canonical_keyword);
    if (!existing || row.score > existing.score) rowsByKeyword.set(row.canonical_keyword, row);
  }

  const rows = [...rowsByKeyword.values()];

  const { error } = await client
    .from("niche_candidates")
    .upsert(rows, { onConflict: "canonical_keyword" });
  if (error) throw error;

  return rows.reduce(
    (counts, row) => {
      if (row.status === "rejected") counts.rejected += 1;
      if (row.status === "watch") counts.watched += 1;
      if (row.status === "accepted") counts.accepted += 1;
      if (row.status === "promoted") counts.promoted += 1;
      return counts;
    },
    { rejected: 0, watched: 0, accepted: 0, promoted: 0 },
  );
}

async function readEvidencePool(): Promise<{ videos: VideoRow[]; channels: Map<string, ChannelRow> }> {
  const client = getSupabaseAdmin();
  if (!client) return { videos: [], channels: new Map() };
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();

  const { data: videoData, error: videoError } = await client
    .from("videos")
    .select("youtube_id,channel_id,channel_title,title,views,outlier_score,published_at,duration_seconds,tags")
    .eq("content_class", "niche")
    .gte("published_at", since)
    .gte("outlier_score", MIN_OUTLIER)
    .gte("views", MIN_VIEWS)
    .gt("duration_seconds", MIN_DURATION_SECONDS)
    .order("outlier_score", { ascending: false })
    .limit(5_000);
  if (videoError) throw videoError;

  const videos = (videoData ?? []) as unknown as VideoRow[];
  const channelIds = [...new Set(videos.map((video) => video.channel_id).filter(Boolean))];
  if (channelIds.length === 0) return { videos, channels: new Map() };

  const channels = new Map<string, ChannelRow>();
  for (let index = 0; index < channelIds.length; index += 500) {
    const chunk = channelIds.slice(index, index + 500);
    const { data, error } = await client
      .from("channels")
      .select("youtube_id,title,subs,video_count,category,tags,is_monetized,content_class,junk_video_ratio")
      .in("youtube_id", chunk)
      .neq("content_class", "junk");
    if (error) throw error;
    for (const row of (data ?? []) as unknown as ChannelRow[]) {
      if (Number(row.junk_video_ratio ?? 0) < 0.25) channels.set(row.youtube_id, row);
    }
  }

  return { videos, channels };
}

export async function runNicheGraphDiscovery(): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      job: "niche-graph-discovery",
      candidatesFound: 0,
      candidatesAdded: 0,
      metadata: { skipped: "supabase_not_configured" },
    };
  }

  const { videos, channels } = await readEvidencePool();
  const candidates = buildCandidates(videos, channels);
  const verdicts = await judgeCandidates(candidates);
  const lifecycle = await upsertCandidateLifecycle(candidates, verdicts);
  const keywordPromotion = await promoteKeywords(candidates, verdicts);
  const channelsPromoted = await promoteChannels(candidates, verdicts);
  const candidatesAdded = keywordPromotion.promotedKeywords + keywordPromotion.adjacentAdded;

  const metadata = {
    videosScanned: videos.length,
    channelsScanned: channels.size,
    insertedCandidates: candidates.length,
    promotedKeywords: keywordPromotion.promotedKeywords,
    adjacentAdded: keywordPromotion.adjacentAdded,
    channelsPromoted,
    rejected: lifecycle.rejected,
    watched: lifecycle.watched,
    accepted: lifecycle.accepted,
    promoted: lifecycle.promoted,
    topCandidates: candidates.slice(0, 10).map((candidate) => ({
      keyword: candidate.keyword,
      score: candidate.score,
      status: (verdicts.get(candidate.keyword) ?? deterministicVerdict(candidate, "missing_verdict")).verdict,
      channelCount: candidate.evidence.channelCount,
    })),
  };

  await logDiscovery("niche-graph-discovery", candidates.length, candidatesAdded, metadata);

  return {
    job: "niche-graph-discovery",
    candidatesFound: candidates.length,
    candidatesAdded,
    metadata,
  };
}

export async function runNicheCandidateAdjacentStrategist(
  job = "ai:vertical-strategist",
): Promise<KeywordDiscoveryResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return { job, candidatesFound: 0, candidatesAdded: 0, metadata: { skipped: "supabase_not_configured" } };
  }
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");
  if (!hasAiKey()) {
    await logDiscovery(job, 0, 0, { skipped: "ai_api_key_missing" });
    return { job, candidatesFound: 0, candidatesAdded: 0, metadata: { skipped: "ai_api_key_missing" } };
  }

  const { data, error } = await client
    .from("niche_candidates")
    .select("canonical_keyword,score,status,evidence")
    .in("status", ["watch", "accepted", "promoted"])
    .gte("score", 60)
    .order("score", { ascending: false })
    .limit(20);
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    canonical_keyword: string;
    score: number | string;
    status: string;
    evidence: Record<string, unknown>;
  }>;
  if (rows.length === 0) {
    await logDiscovery(job, 0, 0, { skipped: "no_niche_candidates" });
    return { job, candidatesFound: 0, candidatesAdded: 0, metadata: { skipped: "no_niche_candidates" } };
  }

  const ai = await generateAiJson<{ keywords?: Array<{ keyword?: string; category?: string; priority?: number; reason?: string }> }>({
    job,
    maxTokens: 1600,
    temperature: 0.35,
    estimatedUsd: 0.015,
    extraBody: {
      reasoning_effort: "low",
      extra_body: { enable_thinking: false },
    },
    system:
      "You expand proven YouTube niche candidates only into close adjacent search keywords. Return JSON only. Do not create broad verticals or unrelated ideas.",
    user: JSON.stringify({
      task: "Return {keywords:[{keyword,category,priority,reason}]}. Suggest at most 3 close adjacent keywords per candidate.",
      constraints: [
        "Use only close neighbors implied by the evidence.",
        "Reject sports, live, movies, shows, trailers, gameplay, shorts, celebrity, news, and generic trends.",
        "2-5 English words per keyword.",
      ],
      candidates: rows.map((row) => ({
        keyword: row.canonical_keyword,
        score: Number(row.score ?? 0),
        status: row.status,
        evidence: row.evidence,
      })),
    }),
  });

  const existing = await existingKeywords();
  const insertRows = (ai.data.keywords ?? [])
    .map((item) => ({
      keyword: normalizeNicheKeyword(item.keyword ?? ""),
      category: typeof item.category === "string" ? normalizeNicheKeyword(item.category) || null : null,
      priority: clamp(Math.round(Number(item.priority ?? 65)), 55, 80),
      source: "niche_graph_ai",
    }))
    .filter((row, index, arr) =>
      isSeedableKeyword(row.keyword) &&
      !existing.has(row.keyword) &&
      arr.findIndex((item) => item.keyword === row.keyword) === index,
    )
    .slice(0, 60);

  const { data: inserted, error: insertError } =
    insertRows.length > 0
      ? await client
          .from("seed_keywords")
          .upsert(insertRows, { onConflict: "keyword", ignoreDuplicates: true })
          .select("keyword")
      : { data: [], error: null };
  if (insertError) throw insertError;

  const candidatesAdded = (inserted ?? []).length;
  await logDiscovery(job, insertRows.length, candidatesAdded, {
    provider: ai.provider,
    model: ai.model,
    costUsd: ai.costUsd,
    sourceCandidates: rows.length,
  });

  return {
    job,
    candidatesFound: insertRows.length,
    candidatesAdded,
    metadata: {
      provider: ai.provider,
      model: ai.model,
      costUsd: ai.costUsd,
      sourceCandidates: rows.length,
    },
  };
}
