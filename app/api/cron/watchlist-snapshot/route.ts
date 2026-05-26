import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { takeNicheSnapshot } from "@/lib/niche-snapshots";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  // Get all saved searches (keyword watchlist)
  const { data: savedSearches, error } = await client
    .from("saved_searches")
    .select("user_id,keyword")
    .not("keyword", "is", null)
    .not("keyword", "eq", "");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const searches = (savedSearches ?? []) as Array<{ user_id: string; keyword: string }>;
  const results: Array<{ userId: string; keyword: string; ok: boolean; error?: string }> = [];

  for (const { user_id, keyword } of searches) {
    try {
      const snap = await takeNicheSnapshot(user_id, keyword);
      results.push({ userId: user_id, keyword, ok: snap !== null });
    } catch (err) {
      results.push({
        userId: user_id,
        keyword,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    total: searches.length,
    succeeded,
    failed,
    results,
  });
}
