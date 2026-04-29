import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseProjectUrl, supabasePublicKey } from "./supabase-env";

export async function createSupabaseServerClient() {
  const url = supabaseProjectUrl();
  const key = supabasePublicKey();
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies; proxy.ts refreshes sessions.
        }
      },
    },
  });
}
