import { searchCachedVideos } from "@/lib/cache";
import { computeSaturation } from "@/lib/saturation";
import { computeNicheDecision } from "@/lib/niche-decision";
import { groupVideosByChannel } from "@/lib/group-by-channel";

export const dynamic = "force-dynamic";

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const VERDICT_COLORS = {
  Enter: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-300" },
  Test:  { bg: "bg-amber-500/10",  border: "border-amber-500/30",  text: "text-amber-300"  },
  Avoid: { bg: "bg-red-500/10",   border: "border-red-500/30",   text: "text-red-300"   },
};

export async function generateMetadata({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const keyword = sp.q ?? slug.replace(/-/g, " ");
  return {
    title: `${keyword} — NicheFinder Niche Report`,
    description: `Saturation, outlier scores, and verdict for the "${keyword}" YouTube niche.`,
    openGraph: { title: `${keyword} on NicheFinder`, type: "website" },
  };
}

export default async function NicheSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const keyword = (sp.q ?? slug.replace(/-/g, " ")).trim();

  const page = await searchCachedVideos({ q: keyword, page: 1, pageSize: 200 });
  const saturation = computeSaturation(page.results);
  const decision = computeNicheDecision(saturation);
  const groups = groupVideosByChannel(page.results, 3).slice(0, 5);
  const verdict = decision?.verdict ?? null;
  const vc = verdict ? VERDICT_COLORS[verdict] : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <a href="/" className="text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors">
            NicheFinder
          </a>
          <a href={`/app?q=${encodeURIComponent(keyword)}`}
            className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors">
            Full analysis →
          </a>
        </div>

        <h1 className="text-2xl font-bold text-neutral-100 mb-1">{keyword}</h1>
        <p className="text-sm text-neutral-500 mb-6">YouTube niche report</p>

        {!saturation && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 py-12 text-center">
            <div className="text-sm text-neutral-500">Not enough data to generate a report for this niche.</div>
          </div>
        )}

        {saturation && (
          <div className="space-y-4">
            {/* Verdict card */}
            {decision && vc && (
              <div className={`rounded-lg border ${vc.border} ${vc.bg} p-5`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1">Verdict</div>
                    <div className={`text-2xl font-bold ${vc.text}`}>{decision.verdict}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-mono text-3xl font-bold ${vc.text}`}>{decision.score}</div>
                    <div className="text-[10px] opacity-60">out of 100</div>
                  </div>
                </div>
                {decision.reasons.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {decision.reasons.map((r, i) => (
                      <li key={i} className={`text-xs opacity-70 ${vc.text}`}>· {r}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Videos", value: saturation.totalVideos },
                { label: "Channels", value: saturation.uniqueChannels },
                { label: "Avg Outlier", value: `${(saturation.avgOutlierScore ?? 0).toFixed(1)}×` },
                { label: "Small-ch Win", value: `${Math.round((saturation.smallOutlierRatio ?? 0) * 100)}%` },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                  <div className="text-[10px] text-neutral-600 mb-0.5">{m.label}</div>
                  <div className="font-mono text-lg font-semibold text-neutral-100">{m.value}</div>
                </div>
              ))}
            </div>

            {/* Top channels */}
            {groups.length > 0 && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden">
                <div className="border-b border-neutral-800 px-5 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600">Top Channels</div>
                </div>
                <div className="divide-y divide-neutral-800/60">
                  {groups.map((g) => (
                    <div key={g.channelId} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        {g.channelThumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={g.channelThumbnail} alt="" className="h-7 w-7 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-neutral-800 flex-shrink-0 flex items-center justify-center text-xs font-bold text-neutral-600">
                            {g.channelTitle.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-sm text-neutral-300">{g.channelTitle}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-neutral-500">
                        <span>{fmt(g.channelSubs)} subs</span>
                        <span className="font-mono text-sky-400">{g.bestOutlierScore.toFixed(1)}× best</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer CTA */}
            <div className="text-center py-4">
              <a href={`/app?q=${encodeURIComponent(keyword)}`}
                className="inline-block rounded bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-500 transition-colors">
                See full analysis on NicheFinder →
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
