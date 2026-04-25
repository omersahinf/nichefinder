import { notFound } from "next/navigation";
import { getCurrentAdminIdentity } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import KeywordRunner, { type KeywordRow } from "./KeywordRunner";

export const dynamic = "force-dynamic";

async function getInitialKeywords(): Promise<{ keywords: KeywordRow[]; total: number }> {
  const client = getSupabaseAdmin();
  if (!client) return { keywords: [], total: 0 };

  const { data, error, count } = await client
    .from("seed_keywords")
    .select(
      "id,keyword,category,priority,enabled,source,parent_keyword_id,expires_at,last_searched_at,total_runs,total_channels_added,unique_channels_added,created_at",
      { count: "exact" },
    )
    .order("enabled", { ascending: false })
    .order("priority", { ascending: false })
    .order("last_searched_at", { ascending: true, nullsFirst: true })
    .range(0, 99);

  if (error) {
    console.warn("[admin-keywords] initial load failed", error);
    return { keywords: [], total: 0 };
  }

  return { keywords: (data ?? []) as KeywordRow[], total: count ?? 0 };
}

export default async function KeywordsAdminPage() {
  if (process.env.ADMIN_UI_ENABLED !== "true") {
    notFound();
  }
  if (process.env.ADMIN_EMAILS && !(await getCurrentAdminIdentity())) {
    notFound();
  }

  const initial = await getInitialKeywords();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8">
          <div className="text-sm text-neutral-500">Admin</div>
          <h1 className="text-3xl font-bold tracking-tight">Keywords</h1>
        </header>

        <KeywordRunner initialKeywords={initial.keywords} initialTotal={initial.total} />
      </div>
    </main>
  );
}
