import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-guard";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_MAX = 250;

function clampPriority(value: unknown, fallback = 50): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function parseBoolean(value: string | null): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function cleanKeyword(value: unknown): string {
  const keyword = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (keyword.length < 3) throw new Error("Keyword must be at least 3 characters");
  return keyword.toLowerCase();
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      PAGE_SIZE_MAX,
      Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? PAGE_SIZE_DEFAULT)),
    );
    const source = req.nextUrl.searchParams.get("source");
    const category = req.nextUrl.searchParams.get("category");
    const enabled = parseBoolean(req.nextUrl.searchParams.get("enabled"));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = client
      .from("seed_keywords")
      .select(
        "id,keyword,category,priority,enabled,source,parent_keyword_id,expires_at,last_searched_at,total_runs,total_channels_added,unique_channels_added,created_at",
        { count: "exact" },
      );

    if (source) query = query.eq("source", source);
    if (category) query = query.eq("category", category);
    if (enabled !== null) query = query.eq("enabled", enabled);

    const { data, error, count } = await query
      .order("enabled", { ascending: false })
      .order("priority", { ascending: false })
      .order("last_searched_at", { ascending: true, nullsFirst: true })
      .range(from, to);

    if (error) throw error;
    return NextResponse.json({ keywords: data ?? [], total: count ?? 0, page, pageSize });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to list keywords";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as {
      keyword?: unknown;
      category?: unknown;
      priority?: unknown;
    };
    const keyword = cleanKeyword(body.keyword);
    const category =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim().toLowerCase()
        : null;

    const { data, error } = await client
      .from("seed_keywords")
      .upsert(
        {
          keyword,
          category,
          priority: clampPriority(body.priority),
          source: "manual",
          enabled: true,
        },
        { onConflict: "keyword" },
      )
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ keyword: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add keyword";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const body = (await req.json()) as {
      id?: unknown;
      enabled?: unknown;
      priority?: unknown;
      category?: unknown;
    };
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) throw new Error("Keyword id is required");

    const updates: Record<string, unknown> = {};
    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (body.priority !== undefined) updates.priority = clampPriority(body.priority);
    if (body.category !== undefined) {
      updates.category =
        typeof body.category === "string" && body.category.trim()
          ? body.category.trim().toLowerCase()
          : null;
    }
    if (Object.keys(updates).length === 0) throw new Error("No changes provided");

    const { data, error } = await client
      .from("seed_keywords")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ keyword: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update keyword";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const guard = await requireAdminApi();
  if (guard) return guard;

  const client = getSupabaseAdmin();
  if (!client) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw new Error("Keyword id is required");

    const { error } = await client.from("seed_keywords").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete keyword";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
