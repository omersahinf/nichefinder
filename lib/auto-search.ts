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
  expires_at: string | null;
  last_searched_at: string | null;
  total_runs: number | string | null;
  total_channels_added: number | string | null;
  unique_channels_added: number | string | null;
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
      "id,keyword,priority,enabled,expires_at,last_searched_at,total_runs,total_channels_added,unique_channels_added",
    )
    .eq("enabled", true)
    .order("last_searched_at", { ascending: true, nullsFirst: true })
    .order("priority", { ascending: false })
    .limit(Math.max(maxKeywords * 3, maxKeywords));

  if (error) throw error;

  return ((data ?? []) as SeedKeywordRow[])
    .filter((row) => !row.expires_at || new Date(row.expires_at).getTime() > now)
    .slice(0, maxKeywords);
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
