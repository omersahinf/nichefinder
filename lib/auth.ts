import { createSupabaseServerClient } from "./supabase-server";

export interface AuthIdentity {
  id: string;
  email?: string;
  avatarUrl?: string;
}

type AuthClaims = {
  sub?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string): boolean {
  const allowed = adminEmails();
  return Boolean(email && allowed.includes(email.toLowerCase()));
}

export function identityFromClaims(claims: AuthClaims | null | undefined): AuthIdentity | null {
  if (!claims?.sub) return null;

  const userMetadata = claims.user_metadata;
  const avatarUrl =
    userMetadata &&
    typeof userMetadata === "object" &&
    "avatar_url" in userMetadata &&
    typeof userMetadata.avatar_url === "string"
      ? userMetadata.avatar_url
      : undefined;

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    avatarUrl,
  };
}

export async function getCurrentAuthIdentity(): Promise<AuthIdentity | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return identityFromClaims(data.claims);
}

export async function getCurrentAdminIdentity(): Promise<AuthIdentity | null> {
  const identity = await getCurrentAuthIdentity();
  return isAdminEmail(identity?.email) ? identity : null;
}
