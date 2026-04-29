import { createHash, randomBytes } from "crypto";
import { getSupabaseAdmin } from "./supabase";

export interface ApiKeyRecord {
  id: string;
  label: string;
  keyPrefix: string;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

interface ApiKeyRow {
  id: string;
  label: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  user_id: string;
  key_hash: string;
}

const toApiKeyRecord = (row: ApiKeyRow): ApiKeyRecord => ({
  id: row.id,
  label: row.label,
  keyPrefix: row.key_prefix,
  lastUsedAt: row.last_used_at ?? undefined,
  revokedAt: row.revoked_at ?? undefined,
  createdAt: row.created_at,
});

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function buildApiKey(): { rawKey: string; prefix: string; hash: string } {
  const token = randomBytes(24).toString("hex");
  const rawKey = `nf_live_${token}`;
  return {
    rawKey,
    prefix: rawKey.slice(0, 12),
    hash: hashKey(rawKey),
  };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const client = getSupabaseAdmin();
  if (!client || !userId) return [];

  const { data, error } = await client
    .from("api_keys")
    .select("id,label,key_prefix,last_used_at,revoked_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return ((data ?? []) as ApiKeyRow[]).map(toApiKeyRecord);
}

export async function createApiKey(userId: string, label: string): Promise<{
  apiKey: string;
  keys: ApiKeyRecord[];
}> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");
  if (!userId) throw new Error("User required");

  const cleanLabel = label.trim();
  if (!cleanLabel) throw new Error("Label required");

  const { rawKey, prefix, hash } = buildApiKey();

  const { error } = await client.from("api_keys").insert({
    user_id: userId,
    label: cleanLabel,
    key_prefix: prefix,
    key_hash: hash,
  });

  if (error) throw error;
  return {
    apiKey: rawKey,
    keys: await listApiKeys(userId),
  };
}

export async function revokeApiKey(userId: string, id: string): Promise<ApiKeyRecord[]> {
  const client = getSupabaseAdmin();
  if (!client) throw new Error("Supabase is not configured");
  if (!userId || !id) throw new Error("User and key id required");

  const { error } = await client
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .is("revoked_at", null);

  if (error) throw error;
  return listApiKeys(userId);
}

export async function validateApiKey(rawKey: string): Promise<{ userId: string } | null> {
  const client = getSupabaseAdmin();
  if (!client || !rawKey) return null;

  const { data, error } = await client
    .from("api_keys")
    .select("id,user_id,key_hash,revoked_at")
    .eq("key_hash", hashKey(rawKey))
    .maybeSingle();

  if (error) throw error;
  const row = data as Pick<ApiKeyRow, "id" | "user_id" | "key_hash" | "revoked_at"> | null;
  if (!row || row.revoked_at) return null;

  await client
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return { userId: row.user_id };
}
