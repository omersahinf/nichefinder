import { getTodayQuotaUsage, recordApiUsage } from "./cache";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";
import { searchAndEnrich } from "./youtube";

const ESTIMATED_SEARCH_UNITS = 102;
const QUOTA_BUFFER_UNITS = 200;
const KEYWORD_DELAY_MS = 2_000;

export type AutoSearchStopReason =
  | "completed"
  | "no_keywords"
  | "quota_guard"
  | "supabase_not_configured";

export interface AutoSearchKeywordResult {
  id: string;
  keyword: string;
  keywordSource: string;
  queueScore: number;
  channelsDiscovered: number;
  unitsUsed: number;
  source: string;
  cacheHit: boolean;
  fallbackReason?: string;
}

export interface AutoSearchResult {
  keywordsProcessed: number;
  channelsDiscovered: number;
  unitsUsed: number;
  stoppedReason: AutoSearchStopReason;
  perKeyword: AutoSearchKeywordResult[];
}

interface SeedKeywordRow {
  id: string;
  keyword: string;
  priority: number | string | null;
  enabled: boolean | null;
  source: string | null;
  expires_at: string | null;
  last_searched_at: string | null;
  total_runs: number | string | null;
  total_channels_added: number | string | null;
  unique_channels_added: number | string | null;
  created_at: string | null;
}

const shouldStopForQuota = async (): Promise<boolean> => {
  const quota = await getTodayQuotaUsage();
  return quota.used + ESTIMATED_SEARCH_UNITS + QUOTA_BUFFER_UNITS > quota.guardAt;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function listRunnableKeywords(maxKeywords: number): Promise<SeedKeywordRow[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const now = Date.now();
  const { data, error } = await client
    .from("seed_keywords")
    .select(
      "id,keyword,priority,enabled,source,expires_at,last_searched_at,total_runs,total_channels_added,unique_channels_added,created_at",
    )
    .eq("enabled", true)
    .order("last_searched_at", { ascending: true, nullsFirst: true })
    .order("priority", { ascending: false })
    .limit(Math.max(maxKeywords * 8, maxKeywords));

  if (error) throw error;

  return ((data ?? []) as SeedKeywordRow[])
    .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
    .sort((a, b) => smartQueueScore(b) - smartQueueScore(a) || a.keyword.localeCompare(b.keyword))
    .slice(0, maxKeywords);
}

function daysSince(value: string | null): number {
  if (!value) return 999;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 999;
  return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}

function smartQueueScore(row: SeedKeywordRow): number {
  const runs = Number(row.total_runs ?? 0);
  const channels = Number(row.total_channels_added ?? 0);
  const uniqueChannels = Number(row.unique_channels_added ?? channels);
  const priority = Number(row.priority ?? 50);
  const yieldScore = channels / Math.max(runs, 1);
  const sourceBonus: Record<string, number> = {
    pattern_probe: 26,
    ai_slot: 24,
    ai_vertical: 18,
    trend: 16,
    extracted: 12,
    manual: 10,
    variation: 8,
    ai_generated: 8,
  };
  const freshnessBonus = row.last_searched_at ? Math.min(30, daysSince(row.last_searched_at) * 3) : 42;
  const newKeywordBonus = runs === 0 ? 28 : 0;
  const yieldBonus = Math.min(45, yieldScore * 1.5);
  const duplicatePenalty =
    channels > 0 ? Math.min(18, Math.max(0, channels - uniqueChannels) / Math.max(channels, 1) * 30) : 0;
  const lowYieldPenalty =
    runs >= 5 && yieldScore < 1 ? 35 : runs >= 3 && yieldScore < 2 ? 18 : 0;

  return Math.round(
    priority +
      (sourceBonus[row.source ?? ""] ?? 5) +
      freshnessBonus +
      newKeywordBonus +
      yieldBonus -
      duplicatePenalty -
      lowYieldPenalty,
  );
}

async function updateKeywordAfterRun(
  id: string,
  channelsDiscovered: number,
): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client) return;

  const { data, error } = await client
    .from("seed_keywords")
    .select("total_runs,total_channels_added,unique_channels_added")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;

  const current = data as Pick<
    SeedKeywordRow,
    "total_runs" | "total_channels_added" | "unique_channels_added"
  > | null;

  const { error: updateError } = await client
    .from("seed_keywords")
    .update({
      last_searched_at: new Date().toISOString(),
      total_runs: Number(current?.total_runs ?? 0) + 1,
      total_channels_added: Number(current?.total_channels_added ?? 0) + channelsDiscovered,
      unique_channels_added: Number(current?.unique_channels_added ?? 0) + channelsDiscovered,
    })
    .eq("id", id);

  if (updateError) throw updateError;
}

export async function runAutoSearch({
  maxKeywords,
  source,
}: {
  maxKeywords: number;
  source: string;
}): Promise<AutoSearchResult> {
  if (!isSupabaseConfigured() || !getSupabaseAdmin()) {
    return {
      keywordsProcessed: 0,
      channelsDiscovered: 0,
      unitsUsed: 0,
      stoppedReason: "supabase_not_configured",
      perKeyword: [],
    };
  }

  const keywords = await listRunnableKeywords(Math.max(0, Math.min(maxKeywords, 100)));
  if (keywords.length === 0) {
    return {
      keywordsProcessed: 0,
      channelsDiscovered: 0,
      unitsUsed: 0,
      stoppedReason: "no_keywords",
      perKeyword: [],
    };
  }

  const perKeyword: AutoSearchKeywordResult[] = [];
  let channelsDiscovered = 0;
  let unitsUsed = 0;
  let stoppedReason: AutoSearchStopReason = "completed";

  for (const keyword of keywords) {
    if (await shouldStopForQuota()) {
      stoppedReason = "quota_guard";
      break;
    }

    const result = await searchAndEnrich(keyword.keyword, 50);
    const channelIds = new Set(result.results.map((video) => video.channelId).filter(Boolean));
    const channelCount = channelIds.size;
    const keywordUnits = result.quotaUnits ?? 0;

    await recordApiUsage(
      keywordUnits,
      {
        job: "auto_search",
        keyword: keyword.keyword,
        keywordId: keyword.id,
        keywordSource: keyword.source ?? "unknown",
        queueScore: smartQueueScore(keyword),
        resultSource: result.source,
      },
      source,
    );
    await updateKeywordAfterRun(keyword.id, channelCount);

    channelsDiscovered += channelCount;
    unitsUsed += keywordUnits;
    perKeyword.push({
      id: keyword.id,
      keyword: keyword.keyword,
      keywordSource: keyword.source ?? "unknown",
      queueScore: smartQueueScore(keyword),
      channelsDiscovered: channelCount,
      unitsUsed: keywordUnits,
      source: result.source,
      cacheHit: result.cacheHit ?? false,
      fallbackReason: result.fallbackReason,
    });

    if (perKeyword.length < keywords.length) {
      await sleep(KEYWORD_DELAY_MS);
    }
  }

  return {
    keywordsProcessed: perKeyword.length,
    channelsDiscovered,
    unitsUsed,
    stoppedReason,
    perKeyword,
  };
}
