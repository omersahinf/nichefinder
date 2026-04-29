import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseProjectUrl, supabasePublicKey } from "./supabase-env";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  const url = supabaseProjectUrl();
  const key = supabasePublicKey();
  if (!url || !key) return null;

  browserClient ??= createBrowserClient(url, key);
  return browserClient;
}
