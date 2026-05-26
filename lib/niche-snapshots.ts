import { getSupabaseAdmin } from "./supabase";
import { computeSaturation } from "./saturation";
import { searchCachedVideos } from "./cache";

export interface NicheSnapshot {
  id: number;
  keyword: string;
  saturationLevel: string;
  opportunityScore: number;
  avgOutlier: number;
  smallWinRatio: number;
  rpmMin?: number;
  rpmMax?: number;
  totalChannels: number;
  snappedAt: string;
}

export async function takeNicheSnapshot(userId: string, keyword: string): Promise<NicheSnapshot | null> {
  const client = getSupabaseAdmin();
  if (!client) return null;

  const dbPage = await searchCachedVideos({ q: keyword, page: 1, pageSize: 200, sort: "outlier" });
  if (dbPage.results.length < 5) return null;

  const sat = computeSaturation(dbPage.results);
  if (!sat) return null;

  const { data, error } = await client
    .from("niche_snapshots")
    .insert({
      user_id: userId,
      keyword,
      saturation_level: sat.level,
      opportunity_score: sat.opportunityScore ?? 0,
      avg_outlier: sat.avgOutlier,
      small_win_ratio: sat.smallOutlierRatio,
      rpm_min: sat.rpmMin ?? null,
      rpm_max: sat.rpmMax ?? null,
      total_channels: sat.totalChannels,
    })
    .select()
    .single();

  if (error) throw error;

  return rowToSnapshot(data);
}

export async function getNicheSnapshots(userId: string, keyword: string, limit = 8): Promise<NicheSnapshot[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("niche_snapshots")
    .select("*")
    .eq("user_id", userId)
    .eq("keyword", keyword)
    .order("snapped_at", { ascending: false })
    .limit(limit);

  if (error) return [];
  return (data ?? []).map(rowToSnapshot);
}

export async function getWatchlistSnapshots(
  userId: string,
  keywords: string[],
): Promise<Record<string, NicheSnapshot[]>> {
  if (keywords.length === 0) return {};
  const client = getSupabaseAdmin();
  if (!client) return {};

  const { data, error } = await client
    .from("niche_snapshots")
    .select("*")
    .eq("user_id", userId)
    .in("keyword", keywords)
    .order("snapped_at", { ascending: false })
    .limit(keywords.length * 8);

  if (error) return {};

  const result: Record<string, NicheSnapshot[]> = {};
  for (const row of data ?? []) {
    const snap = rowToSnapshot(row);
    if (!result[snap.keyword]) result[snap.keyword] = [];
    if (result[snap.keyword].length < 8) result[snap.keyword].push(snap);
  }
  return result;
}

type SnapshotRow = {
  id: number;
  keyword: string;
  saturation_level: string;
  opportunity_score: number;
  avg_outlier: number | string;
  small_win_ratio: number | string;
  rpm_min: number | null;
  rpm_max: number | null;
  total_channels: number;
  snapped_at: string;
};

function rowToSnapshot(row: SnapshotRow): NicheSnapshot {
  return {
    id: row.id,
    keyword: row.keyword,
    saturationLevel: row.saturation_level,
    opportunityScore: row.opportunity_score,
    avgOutlier: Number(row.avg_outlier),
    smallWinRatio: Number(row.small_win_ratio),
    rpmMin: row.rpm_min ?? undefined,
    rpmMax: row.rpm_max ?? undefined,
    totalChannels: row.total_channels,
    snappedAt: row.snapped_at,
  };
}
