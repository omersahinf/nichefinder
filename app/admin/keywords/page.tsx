import { notFound } from "next/navigation";
import { getCurrentAdminIdentity } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import KeywordRunner, { type KeywordRow } from "./KeywordRunner";
import { QuotaYieldChart } from "./QuotaYieldChart";

export const dynamic = "force-dynamic";

interface ApiUsageRow {
  date: string;
  source: string;
  units: number;
}

interface ChannelRow {
  created_at: string;
}

async function getQuotaYieldData() {
  const client = getSupabaseAdmin();
  if (!client) return [];

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [usageRes, channelsRes] = await Promise.all([
    client.from("api_usage").select("date,source,units").gte("date", since).eq("source", "cron_auto_search"),
    client.from("channels").select("created_at").gte("created_at", since).order("created_at", { ascending: true }),
  ]);

  const usageByDay: Record<string, number> = {};
  for (const row of (usageRes.data ?? []) as ApiUsageRow[]) {
    const day = row.date?.slice(0, 10) ?? "";
    if (day) usageByDay[day] = (usageByDay[day] ?? 0) + (row.units ?? 0);
  }

  const channelsByDay: Record<string, number> = {};
  for (const row of (channelsRes.data ?? []) as ChannelRow[]) {
    const day = row.created_at?.slice(0, 10) ?? "";
    if (day) channelsByDay[day] = (channelsByDay[day] ?? 0) + 1;
  }

  const days: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }

  return days.map((date) => {
    const quotaUsed = usageByDay[date] ?? 0;
    const newChannels = channelsByDay[date] ?? 0;
    const keywordsRun = quotaUsed > 0 ? Math.round(quotaUsed / 100) : 0;
    return {
      date: date.slice(5),
      quotaUsed,
      newChannels,
      yieldPerKeyword: keywordsRun > 0 ? newChannels / keywordsRun : 0,
    };
  }).filter((d) => d.quotaUsed > 0 || d.newChannels > 0);
}

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

  const [initial, quotaData] = await Promise.all([getInitialKeywords(), getQuotaYieldData()]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8">
          <div className="text-sm text-neutral-500">Admin</div>
          <h1 className="text-3xl font-bold tracking-tight">Keywords</h1>
        </header>

        {quotaData.length > 0 && (
          <div className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/60 p-5">
            <h2 className="text-sm font-semibold text-neutral-300 mb-4">Quota & Yield — Last 14 Days</h2>
            <QuotaYieldChart data={quotaData} />
          </div>
        )}

        <KeywordRunner initialKeywords={initial.keywords} initialTotal={initial.total} />
      </div>
    </main>
  );
}
