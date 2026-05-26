import { getCurrentAuthIdentity } from "@/lib/auth";
import { listSavedSearchesForUser } from "@/lib/saved-searches";
import { getWatchlistSnapshots } from "@/lib/niche-snapshots";
import { computeNicheDecision } from "@/lib/niche-decision";
import type { NicheSnapshot } from "@/lib/niche-snapshots";
import { WatchlistChart } from "./WatchlistChart";

export const dynamic = "force-dynamic";

const SAT_COLORS: Record<string, string> = {
  low: "text-green-400",
  "medium-low": "text-teal-400",
  medium: "text-yellow-400",
  "medium-high": "text-orange-400",
  high: "text-red-400",
};

function latestVerdict(snapshots: NicheSnapshot[]) {
  if (!snapshots.length) return null;
  const latest = snapshots[0];
  return computeNicheDecision({
    totalVideos: 50,
    uniqueChannels: latest.totalChannels,
    totalChannels: latest.totalChannels,
    medianChannelSubs: 0,
    medianSubs: 0,
    smallChannelCount: 0,
    smallChannelRatio: 0,
    smallChannelOutliers: 0,
    smallOutlierRatio: latest.smallWinRatio,
    avgOutlier: latest.avgOutlier,
    avgOutlierScore: latest.avgOutlier,
    level: (["low", "medium", "high"].includes(latest.saturationLevel)
      ? latest.saturationLevel
      : "medium") as "low" | "medium" | "high",
    label: latest.saturationLevel,
    hint: "",
    rpmMin: latest.rpmMin,
    rpmMax: latest.rpmMax,
    opportunityScore: latest.opportunityScore,
  });
}

function trendArrow(snapshots: NicheSnapshot[], metric: keyof NicheSnapshot): string {
  if (snapshots.length < 2) return "";
  const latest = Number(snapshots[0][metric]);
  const prev = Number(snapshots[1][metric]);
  if (latest > prev + 0.5) return "↑";
  if (latest < prev - 0.5) return "↓";
  return "→";
}

export default async function WatchlistPage() {
  const identity = await getCurrentAuthIdentity();
  const saves = await listSavedSearchesForUser(identity?.id);
  const keywords = saves.map((s) => s.keyword).filter((k): k is string => Boolean(k));
  const snapshotMap = keywords.length
    ? await getWatchlistSnapshots(identity?.id ?? "", keywords)
    : {};

  const watchedSearches = saves.filter((s) => s.keyword && snapshotMap[s.keyword]?.length > 0);
  const unwatched = saves.filter((s) => !s.keyword || !snapshotMap[s.keyword]?.length);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-neutral-100">Watchlist</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Niche trend over time — snapshots taken weekly by the automation cron.
          </p>
        </div>

        {saves.length === 0 && (
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-6 py-12 text-center">
            <p className="text-sm text-neutral-500">No saved searches yet.</p>
            <a
              href="/app"
              className="mt-3 inline-block rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition-colors"
            >
              Go to search →
            </a>
          </div>
        )}

        {watchedSearches.length > 0 && (
          <div className="space-y-4 mb-10">
            {watchedSearches.map((s) => {
              const snaps = snapshotMap[s.keyword!] ?? [];
              const verdict = latestVerdict(snaps);
              const latest = snaps[0];
              const satColor = SAT_COLORS[latest?.saturationLevel ?? ""] ?? "text-neutral-400";
              const oppArrow = trendArrow(snaps, "opportunityScore");
              const outlierArrow = trendArrow(snaps, "avgOutlier");

              return (
                <div
                  key={s.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden"
                >
                  {/* Header */}
                  <div className="flex items-center justify-between gap-4 border-b border-neutral-800 px-5 py-3.5">
                    <div className="min-w-0">
                      <a
                        href={`/app?q=${encodeURIComponent(s.keyword!)}`}
                        className="font-semibold text-neutral-100 hover:text-red-300 transition-colors"
                      >
                        {s.label}
                      </a>
                      <div className="mt-0.5 text-[11px] text-neutral-500">{s.keyword}</div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {verdict && (
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold border ${
                            verdict.verdict === "Enter"
                              ? "bg-green-500/10 text-green-300 border-green-500/20"
                              : verdict.verdict === "Test"
                              ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                              : "bg-red-500/10 text-red-300 border-red-500/20"
                          }`}
                        >
                          {verdict.verdict}
                        </span>
                      )}
                      {latest && (
                        <span className={`text-[11px] font-medium ${satColor}`}>
                          {latest.saturationLevel}
                        </span>
                      )}
                      <span className="text-[10px] text-neutral-600">
                        {snaps.length} snapshot{snaps.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* Metrics strip */}
                  {latest && (
                    <div className="grid grid-cols-3 divide-x divide-neutral-800 border-b border-neutral-800">
                      <div className="px-5 py-2.5">
                        <div className="text-[10px] text-neutral-600 uppercase tracking-wide mb-0.5">
                          Opportunity {oppArrow}
                        </div>
                        <div className="font-mono text-sm font-semibold text-neutral-100">
                          {latest.opportunityScore}
                          <span className="text-neutral-600 text-xs font-normal"> / 100</span>
                        </div>
                      </div>
                      <div className="px-5 py-2.5">
                        <div className="text-[10px] text-neutral-600 uppercase tracking-wide mb-0.5">
                          Avg Outlier {outlierArrow}
                        </div>
                        <div className="font-mono text-sm font-semibold text-neutral-100">
                          {latest.avgOutlier.toFixed(1)}×
                        </div>
                      </div>
                      <div className="px-5 py-2.5">
                        <div className="text-[10px] text-neutral-600 uppercase tracking-wide mb-0.5">
                          Small-ch Win Rate
                        </div>
                        <div className="font-mono text-sm font-semibold text-neutral-100">
                          {Math.round(latest.smallWinRatio * 100)}%
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Charts */}
                  <div className="grid grid-cols-3 divide-x divide-neutral-800 px-0">
                    <div className="px-5 py-3">
                      <div className="text-[10px] text-neutral-600 mb-1">Opportunity</div>
                      <WatchlistChart
                        snapshots={snaps}
                        metric="opportunityScore"
                        color="#22c55e"
                        label="Opportunity"
                      />
                    </div>
                    <div className="px-5 py-3">
                      <div className="text-[10px] text-neutral-600 mb-1">Avg Outlier</div>
                      <WatchlistChart
                        snapshots={snaps}
                        metric="avgOutlier"
                        color="#38bdf8"
                        label="Avg Outlier"
                      />
                    </div>
                    <div className="px-5 py-3">
                      <div className="text-[10px] text-neutral-600 mb-1">Small-ch Win %</div>
                      <WatchlistChart
                        snapshots={snaps}
                        metric="smallWinRatio"
                        color="#f59e0b"
                        label="Win Rate"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Saved searches without snapshots */}
        {unwatched.length > 0 && (
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-600">
              Saved — No Snapshots Yet
            </h2>
            <div className="space-y-1">
              {unwatched.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded border border-neutral-800/60 bg-neutral-900/40 px-4 py-2.5"
                >
                  <div>
                    <a
                      href={s.keyword ? `/app?q=${encodeURIComponent(s.keyword)}` : "/app"}
                      className="text-sm text-neutral-300 hover:text-red-300 transition-colors"
                    >
                      {s.label}
                    </a>
                    {s.keyword && (
                      <span className="ml-2 text-[11px] text-neutral-600">{s.keyword}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-neutral-700">Snapshot pending</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
