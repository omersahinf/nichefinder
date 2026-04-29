import { getSupabaseAdmin } from "./supabase";

export interface SavedSearch {
  id: string;
  label: string;
  keyword?: string;
  filtersJson: Record<string, unknown>;
  createdAt: string;
  lastVisitedAt?: string;
}

export interface SavedSearchInput {
  label: string;
  keyword?: string;
  filtersJson?: Record<string, unknown>;
  userId?: string;
}

interface SavedSearchRow {
  id: string;
  label: string;
  keyword: string | null;
  filters_json: Record<string, unknown> | null;
  created_at: string;
  last_visited_at: string | null;
}

const toSavedSearch = (row: SavedSearchRow): SavedSearch => ({
  id: row.id,
  label: row.label,
  keyword: row.keyword ?? undefined,
  filtersJson: row.filters_json ?? {},
  createdAt: row.created_at,
  lastVisitedAt: row.last_visited_at ?? undefined,
});

function cleanFiltersJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, item]) => {
      if (typeof item === "string") return item.trim() !== "";
      if (typeof item === "number") return Number.isFinite(item);
      if (typeof item === "boolean") return true;
      return item !== null && item !== undefined;
    }),
  );
}

export async function listSavedSearches(): Promise<SavedSearch[]> {
  return listSavedSearchesForUser();
}

export async function listSavedSearchesForUser(userId?: string): Promise<SavedSearch[]> {
  const client = getSupabaseAdmin();
  if (!client) return [];

  let query = client
    .from("saved_searches")
    .select("id,label,keyword,filters_json,created_at,last_visited_at")
    .order("last_visited_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.or(`user_id.eq.${userId},user_id.is.null`);
  } else {
    query = query.is("user_id", null);
  }

  const { data, error } = await query;

  if (error) throw error;
  return ((data ?? []) as SavedSearchRow[]).map(toSavedSearch);
}

export async function createSavedSearch(input: SavedSearchInput): Promise<SavedSearch[]> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");

  const label = input.label.trim();
  const keyword = input.keyword?.trim() || null;
  if (!label) throw new Error("Label required");

  const { error } = await client.from("saved_searches").insert({
    label,
    keyword,
    filters_json: cleanFiltersJson(input.filtersJson),
    user_id: input.userId ?? null,
  });

  if (error) throw error;
  return listSavedSearchesForUser(input.userId);
}

export async function deleteSavedSearch(id: string): Promise<SavedSearch[]> {
  return deleteSavedSearchForUser(id);
}

export async function deleteSavedSearchForUser(id: string, userId?: string): Promise<SavedSearch[]> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");
  if (!id) throw new Error("Saved search ID required");

  let query = client.from("saved_searches").delete().eq("id", id);
  query = userId ? query.or(`user_id.eq.${userId},user_id.is.null`) : query.is("user_id", null);

  const { error } = await query;
  if (error) throw error;
  return listSavedSearchesForUser(userId);
}

export async function touchSavedSearch(id: string): Promise<SavedSearch[]> {
  return touchSavedSearchForUser(id);
}

export async function touchSavedSearchForUser(id: string, userId?: string): Promise<SavedSearch[]> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");
  if (!id) throw new Error("Saved search ID required");

  let query = client
    .from("saved_searches")
    .update({ last_visited_at: new Date().toISOString() })
    .eq("id", id);
  query = userId ? query.or(`user_id.eq.${userId},user_id.is.null`) : query.is("user_id", null);

  const { error } = await query;
  if (error) throw error;
  return listSavedSearchesForUser(userId);
}
