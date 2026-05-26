import { getSupabaseAdmin } from "./supabase";

export type LogScope =
  | "cache"
  | "search"
  | "ai"
  | "cron"
  | "grow-discover"
  | "auto-search"
  | "channel-quality"
  | "uploads-deep-scan"
  | "keyword-tuning"
  | "niche-snapshots"
  | string;

interface LogMeta {
  userId?: string;
  job?: string;
  [key: string]: unknown;
}

export function logCatch(scope: LogScope, err: unknown, meta: LogMeta = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;

  console.error(`[${scope}] caught error:`, message, { ...meta, stack });

  const client = getSupabaseAdmin();
  if (!client) return;

  void client
    .from("app_errors")
    .insert({ scope, message, stack: stack ?? null, metadata: meta })
    .then(({ error }) => {
      if (error) console.error(`[logger] failed to write to app_errors:`, error.message);
    });
}

export function logWarn(scope: LogScope, message: string, meta: LogMeta = {}): void {
  console.warn(`[${scope}] ${message}`, meta);
}
