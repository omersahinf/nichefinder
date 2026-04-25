import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { runAutoSearch } from "@/lib/auto-search";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  try {
    const body = (await req.json().catch(() => ({}))) as { maxKeywords?: number };
    const maxKeywords = Number.isFinite(body.maxKeywords)
      ? Math.max(1, Math.min(100, Number(body.maxKeywords)))
      : 88;

    const result = await runAutoSearch({
      maxKeywords,
      source: "admin_auto_search",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run auto-search";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
