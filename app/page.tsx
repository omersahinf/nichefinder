"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SaturationReport } from "@/lib/saturation";
import { slugifyNiche } from "@/lib/niche-utils";
import type { EnrichedVideo, QuotaUsage, SearchSource } from "@/lib/search-types";

type SortKey = "outlier" | "views" | "date" | "subs";

interface Filters {
  minSubs: number;
  maxSubs: number;
  minViews: number;
  minOutlier: number;
  days: number; // 0 = all time
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = {
  minSubs: 0,
  maxSubs: 10_000_000,
  minViews: 0,
  minOutlier: 0,
  days: 0,
  sort: "outlier",
};

const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

const daysAgo = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

const DAYS_OPTIONS: Array<{ label: string; value: number }> = [
  { label: "All time", value: 0 },
  { label: "Last 7 days", value: 7 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 90 days", value: 90 },
  { label: "Last year", value: 365 },
];

const SUB_PRESETS: Array<{ label: string; min: number; max: number }> = [
  { label: "All", min: 0, max: 10_000_000 },
  { label: "< 1K", min: 0, max: 1_000 },
  { label: "1K–10K", min: 1_000, max: 10_000 },
  { label: "10K–100K", min: 10_000, max: 100_000 },
  { label: "100K–1M", min: 100_000, max: 1_000_000 },
  { label: "1M+", min: 1_000_000, max: 10_000_000 },
];

export default function Home() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<EnrichedVideo[]>([]);
  const [saturation, setSaturation] = useState<SaturationReport | null>(null);
  const [source, setSource] = useState<SearchSource | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: QuotaUsage | null) => {
        if (!cancelled && data) setQuota(data);
      })
      .catch(() => {
        if (!cancelled) setQuota(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const search = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q,
        max: "50",
      });
      if (filters.days > 0) params.set("days", String(filters.days));
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "search failed");
      setResults(data.results);
      setSaturation(data.saturation ?? null);
      setSource(data.source ?? null);
      setFallbackReason(data.fallbackReason ?? null);
      setQuota(data.quota ?? null);
      setLastQuery(q.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      setResults([]);
      setSaturation(null);
      setSource(null);
      setFallbackReason(null);
    } finally {
      setLoading(false);
    }
  };

  const nicheHref = useMemo(() => {
    const keyword = lastQuery || q.trim();
    const slug = slugifyNiche(keyword);
    return keyword ? `/niche/${slug}?q=${encodeURIComponent(keyword)}` : `/niche/${slug}`;
  }, [lastQuery, q]);

  const filtered = useMemo(() => {
    const list = results.filter(
      (r) =>
        r.channelSubs >= filters.minSubs &&
        r.channelSubs <= filters.maxSubs &&
        r.views >= filters.minViews &&
        r.outlierScore >= filters.minOutlier,
    );
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (filters.sort) {
        case "views":
          return b.views - a.views;
        case "date":
          return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        case "subs":
          return a.channelSubs - b.channelSubs;
        case "outlier":
        default:
          return b.outlierScore - a.outlierScore;
      }
    });
    return sorted;
  }, [results, filters]);

  const setSubRange = (min: number, max: number): void => {
    setFilters((f) => ({ ...f, minSubs: min, maxSubs: max }));
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">
              NicheFinder<span className="text-red-500">.</span>
            </h1>
            <p className="mt-2 text-neutral-400">YouTube niche discovery + outlier analysis.</p>
          </div>
          <div className="w-fit rounded-lg border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-sm">
            <div className="font-mono text-neutral-200">
              Quota: {quota ? `${fmt(quota.used)} / ${fmt(quota.limit)}` : "..."}
            </div>
            {quota && !quota.configured && (
              <div className="mt-1 text-xs text-neutral-500">Supabase offline</div>
            )}
          </div>
        </header>

        <form onSubmit={search} className="mb-6 flex gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="niche or keyword (e.g. faceless finance shorts)"
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-base outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-red-600 px-6 py-3 font-medium hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">
                Channel Subs
              </label>
              <div className="flex flex-wrap gap-1">
                {SUB_PRESETS.map((p) => {
                  const active = filters.minSubs === p.min && filters.maxSubs === p.max;
                  return (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => setSubRange(p.min, p.max)}
                      className={`rounded px-2 py-1 text-xs ${
                        active
                          ? "bg-red-600 text-white"
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                      }`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">
                Date range
              </label>
              <select
                value={filters.days}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, days: Number(e.target.value) }))
                }
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              >
                {DAYS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">
                Min views
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                value={filters.minViews}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minViews: Number(e.target.value) || 0 }))
                }
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">
                Min outlier score
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={filters.minOutlier}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, minOutlier: Number(e.target.value) || 0 }))
                }
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-2 block text-xs uppercase tracking-wider text-neutral-400">
                Sort
              </label>
              <select
                value={filters.sort}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, sort: e.target.value as SortKey }))
                }
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
              >
                <option value="outlier">Outlier score (desc)</option>
                <option value="views">Views (desc)</option>
                <option value="date">Newest</option>
                <option value="subs">Subs (asc)</option>
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            Error: {error}
          </div>
        )}

        {source && (
          <div
            className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
              source === "mock"
                ? "border-amber-900 bg-amber-950/40 text-amber-100"
                : source === "cache"
                ? "border-sky-900 bg-sky-950/30 text-sky-100"
                : "border-emerald-900 bg-emerald-950/30 text-emerald-100"
            }`}
          >
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <div className="font-medium">
                {source === "mock"
                  ? "Mock data mode"
                  : source === "cache"
                  ? "Supabase cache data"
                  : "Live YouTube data"}
              </div>
              {source === "mock" && fallbackReason && (
                <div className="text-xs text-amber-200/80">Reason: {fallbackReason}</div>
              )}
            </div>
          </div>
        )}

        {saturation && (
          <div
            className={`mb-6 rounded-lg border p-5 ${
              saturation.level === "low"
                ? "border-emerald-900 bg-emerald-950/30"
                : saturation.level === "medium"
                ? "border-amber-900 bg-amber-950/30"
                : "border-red-900 bg-red-950/30"
            }`}
          >
            <div className="mb-3 flex items-center gap-3">
              <span
                className={`rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider ${
                  saturation.level === "low"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : saturation.level === "medium"
                    ? "bg-amber-500/20 text-amber-300"
                    : "bg-red-500/20 text-red-300"
                }`}
              >
                {saturation.label}
              </span>
              <span className="text-sm text-neutral-400">{saturation.hint}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500">Channels</div>
                <div className="font-mono text-lg">{saturation.totalChannels}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Median subs
                </div>
                <div className="font-mono text-lg">{fmt(saturation.medianSubs)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Small channels (&lt;10K)
                </div>
                <div className="font-mono text-lg">
                  {saturation.smallChannelCount}{" "}
                  <span className="text-sm text-neutral-500">
                    ({(saturation.smallChannelRatio * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Small-channel outliers
                </div>
                <div className="font-mono text-lg">
                  {saturation.smallChannelOutliers}{" "}
                  <span className="text-sm text-neutral-500">
                    ({(saturation.smallOutlierRatio * 100).toFixed(0)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {results.length > 0 && (
          <>
            <div className="mb-3 text-sm text-neutral-400">
              {filtered.length} / {results.length} results shown
            </div>

            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="px-4 py-3">Video</th>
                    <th className="px-4 py-3 text-right">Views</th>
                    <th className="px-4 py-3 text-right">Outlier</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Channel Subs</th>
                    <th className="px-4 py-3 text-right">Trend</th>
                    <th className="px-4 py-3 text-right">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      role="link"
                      tabIndex={0}
                      aria-label={`open ${lastQuery || q} niche detail`}
                      onClick={() => router.push(nicheHref)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(nicheHref);
                        }
                      }}
                      className="cursor-pointer hover:bg-neutral-900/50 focus:bg-neutral-900/70 focus:outline-none"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          {r.thumbnail && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.thumbnail}
                              alt=""
                              className="h-14 w-24 rounded object-cover"
                            />
                          )}
                          <div className="min-w-0">
                            {source !== "mock" ? (
                              <a
                                href={`https://youtube.com/watch?v=${r.id}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="truncate font-medium hover:text-red-400"
                              >
                                {r.title}
                              </a>
                            ) : (
                              <div className="truncate font-medium">{r.title}</div>
                            )}
                            <div className="text-xs text-neutral-400">{r.channelTitle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(r.views)}</td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`inline-block rounded px-2 py-1 font-mono text-xs ${
                            r.outlierScore >= 5
                              ? "bg-red-500/20 text-red-300"
                              : r.outlierScore >= 2
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-neutral-800 text-neutral-400"
                          }`}
                        >
                          {r.outlierScore.toFixed(1)}x
                        </span>
                      </td>
                      <td className="max-w-[220px] px-4 py-3 text-neutral-300">
                        {r.outlierReason}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-neutral-400">
                        {fmt(r.channelSubs)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.channelTrend ? (
                          <span
                            className={`inline-flex items-center gap-1 font-mono text-xs ${
                              r.channelTrend.direction === "rising"
                                ? "text-emerald-400"
                                : r.channelTrend.direction === "falling"
                                ? "text-red-400"
                                : "text-neutral-400"
                            }`}
                            title={`Last 30 days avg: ${fmt(
                              Math.round(r.channelTrend.avgRecent),
                            )} views (${r.channelTrend.sampleSize} videos)`}
                          >
                            {r.channelTrend.direction === "rising"
                              ? "↑"
                              : r.channelTrend.direction === "falling"
                              ? "↓"
                              : "→"}{" "}
                            {(r.channelTrend.growth30d * 100).toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-neutral-400">
                        {daysAgo(r.publishedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="mt-4 rounded-lg border border-dashed border-neutral-800 p-8 text-center text-neutral-500">
                No results match filters. Relax the filters.
              </div>
            )}
          </>
        )}

        {!loading && results.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
            Search a niche and discover outlier videos. A high{" "}
            <span className="text-red-400">outlier score</span> means the video is performing far above the channel average.
          </div>
        )}
      </div>
    </main>
  );
}
