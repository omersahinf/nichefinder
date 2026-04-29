export const supabasePublicKey = (): string | undefined =>
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  undefined;

export const supabaseProjectUrl = (): string | undefined =>
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
