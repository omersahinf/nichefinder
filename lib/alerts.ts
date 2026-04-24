import { getSupabaseAdmin } from "./supabase";
import { normalizeKeyword } from "./niche-utils";
import type { EnrichedVideo } from "./search-types";

export interface UserAlert {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  minOutlier: number;
  minSubs: number;
  maxSubs: number;
  email: string;
  lastNotifiedAt?: string;
  createdAt: string;
}

export interface AlertInput {
  keyword: string;
  minOutlier?: number;
  minSubs?: number;
  maxSubs?: number;
  email: string;
}

export interface AlertMatch {
  alert: UserAlert;
  matches: EnrichedVideo[];
}

interface AlertRow {
  id: string;
  keyword: string;
  normalized_keyword: string;
  min_outlier: number | string | null;
  min_subs: number | string | null;
  max_subs: number | string | null;
  email: string;
  last_notified_at: string | null;
  created_at: string;
}

const toAlert = (row: AlertRow): UserAlert => ({
  id: row.id,
  keyword: row.keyword,
  normalizedKeyword: row.normalized_keyword,
  minOutlier: Number(row.min_outlier ?? 2),
  minSubs: Number(row.min_subs ?? 0),
  maxSubs: Number(row.max_subs ?? 10_000_000),
  email: row.email,
  lastNotifiedAt: row.last_notified_at ?? undefined,
  createdAt: row.created_at,
});

const videoText = (video: EnrichedVideo): string =>
  normalizeKeyword(`${video.title} ${video.description} ${(video.tags ?? []).join(" ")}`);

export async function listAlerts(): Promise<UserAlert[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const { data, error } = await client
    .from("user_alerts")
    .select(
      "id,keyword,normalized_keyword,min_outlier,min_subs,max_subs,email,last_notified_at,created_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as AlertRow[]).map(toAlert);
}

export async function createAlert(input: AlertInput): Promise<UserAlert[]> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const keyword = input.keyword.trim();
  const email = input.email.trim();
  if (!keyword) throw new Error("Keyword required");
  if (!email || !email.includes("@")) throw new Error("Valid email required");

  const { error } = await client.from("user_alerts").insert({
    keyword,
    normalized_keyword: normalizeKeyword(keyword),
    min_outlier: input.minOutlier ?? 2,
    min_subs: input.minSubs ?? 0,
    max_subs: input.maxSubs ?? 10_000_000,
    email,
  });

  if (error) throw error;
  return listAlerts();
}

export async function deleteAlert(id: string): Promise<UserAlert[]> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");
  if (!id) throw new Error("Alert ID required");

  const { error } = await client.from("user_alerts").delete().eq("id", id);
  if (error) throw error;
  return listAlerts();
}

export async function markAlertNotified(id: string): Promise<void> {
  const client = getSupabaseAdmin();
  if (!client || !id) return;

  const { error } = await client
    .from("user_alerts")
    .update({ last_notified_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export async function matchAlerts(newVideos: EnrichedVideo[]): Promise<AlertMatch[]> {
  if (newVideos.length === 0) return [];

  const alerts = await listAlerts();
  return alerts.flatMap((alert) => {
    const matches = newVideos.filter((video) => {
      if (!videoText(video).includes(alert.normalizedKeyword)) return false;
      if (video.outlierScore < alert.minOutlier) return false;
      if (video.channelSubs < alert.minSubs || video.channelSubs > alert.maxSubs) return false;
      return true;
    });

    return matches.length > 0 ? [{ alert, matches }] : [];
  });
}
