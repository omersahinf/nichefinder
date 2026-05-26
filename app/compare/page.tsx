import { searchCachedVideos } from "@/lib/cache";
import { computeSaturation } from "@/lib/saturation";
import { computeNicheDecision } from "@/lib/niche-decision";
import type { NicheDecision } from "@/lib/niche-decision";
import type { SaturationReport } from "@/lib/saturation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Compare Niches — NicheFinder",
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const VERDICT_COLOR: Record<string, string> = {
  Enter: "text-green-300",
  Test: "text-amber-300",
  Avoid: "text-red-300",
};

interface NicheResult {
  keyword: string;
  saturation: SaturationReport | null;
  decision: NicheDecision | null;
}

async function fetchNiche(keyword: string): Promise<NicheResult> {
  const page = await searchCachedVideos({ q: keyword, page: 1, pageSize: 200 });
  const saturation = computeSaturation(page.results);
  const decision = computeNicheDecision(saturation);
  return { keyword, saturation, decision };
}

function MetricCell({ value, better }: { value: string | number; better?: boolean }) {
  return (
    <td className={`px-4 py-3 text-center font-mono text-sm ${better ? "font-bold text-neutral-100" : "text-neutral-400"}`}>
      {value}
    </td>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawQ = params.q;
  const keywords = (Array.isArray(rawQ) ? rawQ : rawQ ? [rawQ] : [])
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 3);

  const niches = keywords.length > 0
    ? await Promise.all(keywords.map(fetchNiche))
    : [];

  const metrics = [
    {
      label: "Verdict",
      render: (n: NicheResult) => n.decision ? (
        <td key="verdict" className={`px-4 py-3 text-center font-semibold text-sm ${VERDICT_COLOR[n.decision.verdict] ?? "text-neutral-400"}`}>
          {n.decision.verdict}
        </td>
      ) : <MetricCell key="verdict" value="—" />,
      better: (niches: NicheResult[]) => {
        const scores = niches.map((n) => n.decision?.score ?? 0);
        const max = Math.max(...scores);
        return scores.map((s) => s === max && max > 0);
      },
    },
    {
      label: "Score",
      render: (n: NicheResult, better?: boolean) => <MetricCell key="score" value={n.decision?.score ?? "—"} better={better} />,
      better: (ns: NicheResult[]) => { const s = ns.map((n) => n.decision?.score ?? 0); const m = Math.max(...s); return s.map((x) => x === m && m > 0); },
    },
    {
      label: "Saturation",
      render: (n: NicheResult) => <td key="sat" className="px-4 py-3 text-center text-xs text-neutral-400">{n.saturation?.level ?? "—"}</td>,
      better: () => niches.map(() => false),
    },
    {
      label: "Videos",
      render: (n: NicheResult, better?: boolean) => <MetricCell key="vids" value={n.saturation?.totalVideos ?? "—"} better={better} />,
      better: (ns: NicheResult[]) => { const s = ns.map((n) => n.saturation?.totalVideos ?? 0); const m = Math.max(...s); return s.map((x) => x === m && m > 0); },
    },
    {
      label: "Channels",
      render: (n: NicheResult, better?: boolean) => <MetricCell key="ch" value={n.saturation?.uniqueChannels ?? "—"} better={better} />,
      better: () => niches.map(() => false),
    },
    {
      label: "Avg Outlier",
      render: (n: NicheResult, better?: boolean) => <MetricCell key="out" value={n.saturation ? `${(n.saturation.avgOutlierScore ?? 0).toFixed(1)}×` : "—"} better={better} />,
      better: (ns: NicheResult[]) => { const s = ns.map((n) => n.saturation?.avgOutlierScore ?? 0); const m = Math.max(...s); return s.map((x) => x === m && m > 0); },
    },
    {
      label: "Small-ch Win %",
      render: (n: NicheResult, better?: boolean) => <MetricCell key="win" value={n.saturation ? `${Math.round((n.saturation.smallOutlierRatio ?? 0) * 100)}%` : "—"} better={better} />,
      better: (ns: NicheResult[]) => { const s = ns.map((n) => n.saturation?.smallOutlierRatio ?? 0); const m = Math.max(...s); return s.map((x) => x === m && m > 0); },
    },
    {
      label: "Median Subs",
      render: (n: NicheResult, better?: boolean) => <MetricCell key="med" value={n.saturation ? fmt(n.saturation.medianChannelSubs) : "—"} better={!better} />,
      better: (ns: NicheResult[]) => { const s = ns.map((n) => n.saturation?.medianChannelSubs ?? Infinity); const m = Math.min(...s); return s.map((x) => x === m && m < Infinity); },
    },
    {
      label: "RPM Range",
      render: (n: NicheResult) => <td key="rpm" className="px-4 py-3 text-center text-xs text-neutral-400">{n.saturation ? `$${n.saturation.rpmMin ?? "?"}–$${n.saturation.rpmMax ?? "?"}` : "—"}</td>,
      better: () => niches.map(() => false),
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-neutral-100">Compare Niches</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Compare up to 3 niches side by side. Add keywords via URL params: <code className="rounded bg-neutral-800 px-1 text-neutral-300">?q=keyword1&amp;q=keyword2</code>
          </p>
        </div>

        {/* Input form */}
        <form method="get" className="mb-8">
          <div className="flex flex-wrap gap-2 items-end">
            {[0, 1, 2].map((i) => (
              <input
                key={i}
                name="q"
                defaultValue={keywords[i] ?? ""}
                placeholder={`Niche ${i + 1}`}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors w-48"
              />
            ))}
            <button type="submit"
              className="rounded bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors">
              Compare
            </button>
          </div>
        </form>

        {niches.length === 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 py-16 text-center">
            <div className="text-2xl text-neutral-700 mb-2">⊕</div>
            <div className="text-sm text-neutral-500">Enter 2-3 keywords above to compare niches.</div>
          </div>
        )}

        {niches.length > 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/40">
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-36">
                      Metric
                    </th>
                    {niches.map((n) => (
                      <th key={n.keyword} className="px-4 py-3 text-center">
                        <a href={`/app?q=${encodeURIComponent(n.keyword)}`}
                          className="text-sm font-semibold text-neutral-100 hover:text-red-300 transition-colors">
                          {n.keyword}
                        </a>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {metrics.map((metric) => {
                    const betterFlags = metric.better(niches);
                    return (
                      <tr key={metric.label} className="hover:bg-neutral-800/20 transition-colors">
                        <td className="px-4 py-3 text-[11px] font-medium text-neutral-500 uppercase tracking-wide">
                          {metric.label}
                        </td>
                        {niches.map((n, i) => metric.render(n, betterFlags[i]))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Reason breakdowns */}
        {niches.length > 0 && (
          <div className="mt-6 grid gap-4" style={{ gridTemplateColumns: `repeat(${niches.length}, 1fr)` }}>
            {niches.map((n) => n.decision && (
              <div key={n.keyword} className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                <div className="text-[10px] uppercase tracking-wide text-neutral-600 mb-2">{n.keyword}</div>
                <ul className="space-y-1">
                  {n.decision.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-neutral-400">· {r}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
