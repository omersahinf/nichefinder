import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let adminClient: SupabaseClient | null = null;

const supabaseUrl = (): string | undefined =>
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;

const serviceRoleKey = (): string | undefined =>
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && serviceRoleKey());
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) return null;

  adminClient ??= createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
