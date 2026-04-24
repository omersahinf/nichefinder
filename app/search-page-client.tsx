"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SaturationReport } from "@/lib/saturation";
import { slugifyNiche } from "@/lib/niche-utils";
import type { EnrichedVideo, QuotaUsage, SearchSource } from "@/lib/search-types";
import { DURATION_PRESETS, formatDurationLabel } from "@/lib/duration";
import { TrendSparkline } from "@/app/components/charts";

type SortKey = "outlier" | "views" | "date" | "subs";
type Mode = "preset" | "custom";

interface Filters {
  subsMode: Mode;
  minSubs: number;
  maxSubs: number;
  dateMode: Mode;
  days: number;
  publishedAfter: string;
  publishedBefore: string;
  durationMode: Mode;
  durationPreset: string;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  minViews: number;
  minOutlier: number;
  sort: SortKey;
}

interface SearchResponse {
  results: EnrichedVideo[];
  saturation?: SaturationReport;
  source?: SearchSource;
  fallbackReason?: string;
  quota?: QuotaUsage;
  fetchedAt?: string;
  browseMode?: boolean;
}

const MAX_SUBS = 10_000_000;

const DEFAULT_FILTERS: Filters = {
  subsMode: "preset",
  minSubs: 0,
  maxSubs: MAX_SUBS,
  dateMode: "preset",
  days: 0,
  publishedAfter: "",
  publishedBefore: "",
  durationMode: "preset",
  durationPreset: "Any",
  minDurationMinutes: 0,
  maxDurationMinutes: 0,
  minViews: 0,
  minOutlier: 0,
  sort: "outlier",
};

const SUB_PRESETS: Array<{ label: string; min: number; max: number }> = [
  { label: "All", min: 0, max: MAX_SUBS },
  { label: "<1K", min: 0, max: 1_000 },
  { label: "1K-10K", min: 1_000, max: 10_000 },
  { label: "10K-100K", min: 10_000, max: 100_000 },
  { label: "100K-1M", min: 100_000, max: 1_000_000 },
  { label: "1M+", min: 1_000_000, max: MAX_SUBS },
];

const DAYS_OPTIONS: Array<{ label: string; chip: string; value: number }> = [
  { label: "All time", chip: "All time", value: 0 },
  { label: "7d", chip: "last 7d", value: 7 },
  { label: "30d", chip: "last 30d", value: 30 },
  { label: "90d", chip: "last 90d", value: 90 },
  { label: "1y", chip: "last 1y", value: 365 },
];

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

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const finiteParam = (params: URLSearchParams, key: string): number | null => {
  const value = params.get(key);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const dateParam = (value: string | null): string => {
  if (!value) return "";
  return value.includes("T") ? value.slice(0, 10) : value;
};

const durationPresetByLabel = (label: string) =>
  DURATION_PRESETS.find((preset) => preset.label === label) ?? DURATION_PRESETS[0];

const normalizeRange = (min: number, max: number): [number, number] =>
  max > 0 && min > max ? [max, min] : [min, max];

function hydrateFilters(params: URLSearchParams): { q: string; filters: Filters } {
  const filters = { ...DEFAULT_FILTERS };
  const minSubs = finiteParam(params, "minSubs");
  const maxSubs = finiteParam(params, "maxSubs");
  if (minSubs !== null || maxSubs !== null) {
    filters.minSubs = minSubs ?? 0;
    filters.maxSubs = maxSubs ?? MAX_SUBS;
    filters.subsMode = SUB_PRESETS.some(
      (preset) => preset.min === filters.minSubs && preset.max === filters.maxSubs,
    )
      ? "preset"
      : "custom";
  }

  const days = finiteParam(params, "days");
  const publishedAfter = dateParam(params.get("publishedAfter"));
  const publishedBefore = dateParam(params.get("publishedBefore"));
  if (publishedAfter || publishedBefore) {
    filters.dateMode = "custom";
    filters.publishedAfter = publishedAfter;
    filters.publishedBefore = publishedBefore;
  } else if (days !== null) {
    filters.days = days;
  }

  const minDurationSeconds = finiteParam(params, "minDurationSeconds");
  const maxDurationSeconds = finiteParam(params, "maxDurationSeconds");
  if (minDurationSeconds !== null || maxDurationSeconds !== null) {
    const preset = DURATION_PRESETS.find(
      (item) =>
        item.minSeconds === (minDurationSeconds ?? 0) &&
        ((!Number.isFinite(item.maxSeconds) && maxDurationSeconds === null) ||
          item.maxSeconds === maxDurationSeconds),
    );
    if (preset) {
      filters.durationPreset = preset.label;
    } else {
      filters.durationMode = "custom";
      filters.minDurationMinutes = Math.round((minDurationSeconds ?? 0) / 60);
      filters.maxDurationMinutes = Math.round((maxDurationSeconds ?? 0) / 60);
    }
  }

  filters.minViews = finiteParam(params, "minViews") ?? 0;
  filters.minOutlier = finiteParam(params, "minOutlier") ?? 0;
  const sort = params.get("sort");
  if (sort === "views" || sort === "date" || sort === "subs") filters.sort = sort;

  return { q: params.get("q") ?? "", filters };
}

function buildSearchParams(q: string, filters: Filters, forceRefresh = false): URLSearchParams {
  const params = new URLSearchParams({ max: "50" });
  const query = q.trim();
  if (query) params.set("q", query);
  if (forceRefresh) params.set("force", "1");

  if (filters.minSubs > 0) params.set("minSubs", String(filters.minSubs));
  if (filters.maxSubs < MAX_SUBS) params.set("maxSubs", String(filters.maxSubs));
  if (filters.minViews > 0) params.set("minViews", String(filters.minViews));
  if (filters.minOutlier > 0) params.set("minOutlier", String(filters.minOutlier));
  if (filters.sort !== "outlier") params.set("sort", filters.sort);

  if (filters.dateMode === "preset") {
    if (filters.days > 0) params.set("days", String(filters.days));
  } else {
    let after = filters.publishedAfter;
    let before = filters.publishedBefore;
    if (after && before && after > before) [after, before] = [before, after];
    if (after) params.set("publishedAfter", after);
    if (before) params.set("publishedBefore", before);
  }

  if (filters.durationMode === "preset") {
    const preset = durationPresetByLabel(filters.durationPreset);
    if (preset.label !== "Any") {
      params.set("minDurationSeconds", String(preset.minSeconds));
      if (Number.isFinite(preset.maxSeconds)) {
        params.set("maxDurationSeconds", String(preset.maxSeconds));
      }
    }
  } else {
    const [min, max] = normalizeRange(
      filters.minDurationMinutes,
      filters.maxDurationMinutes,
    );
    if (min > 0) params.set("minDurationSeconds", String(min * 60));
    if (max > 0) params.set("maxDurationSeconds", String(max * 60));
  }

  return params;
}

function sameSearch(a: URLSearchParams, b: URLSearchParams): boolean {
  a.delete("max");
  b.delete("max");
  return a.toString() === b.toString();
}

function pillClass(active: boolean): string {
  return `rounded px-2.5 py-1.5 text-xs font-medium ${
    active
      ? "bg-red-600 text-white"
      : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
  }`;
}

export function SearchPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(
    () => hydrateFilters(new URLSearchParams(searchParams.toString())).q,
  );
  const [lastQuery, setLastQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<EnrichedVideo[]>([]);
  const [saturation, setSaturation] = useState<SaturationReport | null>(null);
  const [source, setSource] = useState<SearchSource | null>(null);
  const [browseMode, setBrowseMode] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(
    () => hydrateFilters(new URLSearchParams(searchParams.toString())).filters,
  );
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [showRevenue, setShowRevenue] = useState(false);
  const [staleCache, setStaleCache] = useState(false);
  const hydrated = useRef(true);
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (!hydrated.current) return;
    const next = buildSearchParams(q, filters);
    const current = new URLSearchParams(searchParams.toString());
    if (sameSearch(new URLSearchParams(next), current)) return;
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }, [filters, pathname, q, router, searchParams]);

  const search = useCallback(async (event?: FormEvent, forceRefresh = false): Promise<void> => {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = buildSearchParams(q, filters, forceRefresh);
      const res = await fetch(`/api/search?${params}`);
      const data = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "search failed");
      setResults(data.results);
      setSaturation(data.saturation ?? null);
      setSource(data.source ?? null);
      setBrowseMode(data.browseMode === true);
      setFallbackReason(data.fallbackReason ?? null);
      setQuota(data.quota ?? null);
      setStaleCache(
        data.source === "cache" &&
          data.fetchedAt !== undefined &&
          Date.now() - new Date(data.fetchedAt).getTime() > 12 * 60 * 60 * 1000,
      );
      setLastQuery(q.trim());
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      setResults([]);
      setSaturation(null);
      setSource(null);
      setBrowseMode(false);
      setFallbackReason(null);
      setStaleCache(false);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }, [filters, q]);

  useEffect(() => {
    if (!hasSearched) return;
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    autoSearchTimer.current = setTimeout(() => {
      void search();
    }, 350);
    return () => {
      if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    };
  }, [filters, hasSearched, search]);

  const nicheHref = useMemo(() => {
    const keyword = lastQuery || q.trim();
    const slug = slugifyNiche(keyword || "cached-browse");
    return keyword ? `/niche/${slug}?q=${encodeURIComponent(keyword)}` : `/niche/${slug}`;
  }, [lastQuery, q]);

  const filtered = useMemo(() => {
    const sorted = [...results];
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
  }, [results, filters.sort]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    const subPreset = SUB_PRESETS.find(
      (preset) => preset.min === filters.minSubs && preset.max === filters.maxSubs,
    );
    if (filters.minSubs > 0 || filters.maxSubs < MAX_SUBS) {
      chips.push({
        key: "subs",
        label: `Subs: ${subPreset?.label ?? `${fmt(filters.minSubs)}-${fmt(filters.maxSubs)}`}`,
        clear: () =>
          setFilters((current) => ({
            ...current,
            subsMode: "preset",
            minSubs: 0,
            maxSubs: MAX_SUBS,
          })),
      });
    }
    if (filters.dateMode === "preset" && filters.days > 0) {
      const option = DAYS_OPTIONS.find((item) => item.value === filters.days);
      chips.push({
        key: "date",
        label: `Date: ${option?.chip ?? `last ${filters.days}d`}`,
        clear: () => setFilters((current) => ({ ...current, days: 0 })),
      });
    }
    if (filters.dateMode === "custom" && (filters.publishedAfter || filters.publishedBefore)) {
      chips.push({
        key: "date",
        label: `Date: ${filters.publishedAfter || "Any"} to ${filters.publishedBefore || "Any"}`,
        clear: () =>
          setFilters((current) => ({
            ...current,
            dateMode: "preset",
            days: 0,
            publishedAfter: "",
            publishedBefore: "",
          })),
      });
    }
    if (filters.durationMode === "preset" && filters.durationPreset !== "Any") {
      chips.push({
        key: "duration",
        label: `Duration: ${filters.durationPreset}`,
        clear: () =>
          setFilters((current) => ({
            ...current,
            durationMode: "preset",
            durationPreset: "Any",
          })),
      });
    }
    if (
      filters.durationMode === "custom" &&
      (filters.minDurationMinutes > 0 || filters.maxDurationMinutes > 0)
    ) {
      chips.push({
        key: "duration",
        label: `Duration: ${filters.minDurationMinutes || 0}-${filters.maxDurationMinutes || "any"}m`,
        clear: () =>
          setFilters((current) => ({
            ...current,
            durationMode: "preset",
            durationPreset: "Any",
            minDurationMinutes: 0,
            maxDurationMinutes: 0,
          })),
      });
    }
    if (filters.minViews > 0) {
      chips.push({
        key: "views",
        label: `Min views: ${fmt(filters.minViews)}`,
        clear: () => setFilters((current) => ({ ...current, minViews: 0 })),
      });
    }
    if (filters.minOutlier > 0) {
      chips.push({
        key: "outlier",
        label: `Min outlier: ${filters.minOutlier}x`,
        clear: () => setFilters((current) => ({ ...current, minOutlier: 0 })),
      });
    }
    return chips;
  }, [filters]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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

        <form onSubmit={(event) => void search(event)} className="mb-6 flex gap-3">
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="niche or keyword (optional)"
            className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-base outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-red-600 px-6 py-3 font-medium hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "Loading..." : q.trim() ? "Search" : "Apply filters"}
          </button>
        </form>

        <div className="mb-6 space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
          <details open className="group rounded border border-neutral-800 bg-neutral-950/30 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">
              Subscriber range
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {filters.subsMode === "preset" &&
                SUB_PRESETS.map((preset) => {
                  const active = filters.minSubs === preset.min && filters.maxSubs === preset.max;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setFilters((current) => ({
                          ...current,
                          subsMode: "preset",
                          minSubs: preset.min,
                          maxSubs: preset.max,
                        }))
                      }
                      className={pillClass(active)}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              {filters.subsMode === "custom" && (
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-400">
                    Min
                    <input
                      type="number"
                      min={0}
                      value={filters.minSubs}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          subsMode: "custom",
                          minSubs: Number(event.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                    />
                  </label>
                  <label className="text-xs uppercase tracking-wider text-neutral-400">
                    Max
                    <input
                      type="number"
                      min={0}
                      value={filters.maxSubs}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          subsMode: "custom",
                          maxSubs: Number(event.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    subsMode: current.subsMode === "preset" ? "custom" : "preset",
                  }))
                }
                className="text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                {filters.subsMode === "preset" ? "Custom range" : "Use presets"}
              </button>
            </div>
          </details>

          <details open className="rounded border border-neutral-800 bg-neutral-950/30 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">
              Date range
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {filters.dateMode === "preset" &&
                DAYS_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        dateMode: "preset",
                        days: option.value,
                      }))
                    }
                    className={pillClass(filters.days === option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              {filters.dateMode === "custom" && (
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-400">
                    From
                    <input
                      type="date"
                      value={filters.publishedAfter}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          dateMode: "custom",
                          publishedAfter: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                    />
                  </label>
                  <label className="text-xs uppercase tracking-wider text-neutral-400">
                    To
                    <input
                      type="date"
                      value={filters.publishedBefore}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          dateMode: "custom",
                          publishedBefore: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    dateMode: current.dateMode === "preset" ? "custom" : "preset",
                  }))
                }
                className="text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                {filters.dateMode === "preset" ? "Custom dates" : "Use presets"}
              </button>
            </div>
          </details>

          <details open className="rounded border border-neutral-800 bg-neutral-950/30 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-neutral-100">
              Video duration
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {filters.durationMode === "preset" &&
                DURATION_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setFilters((current) => ({
                        ...current,
                        durationMode: "preset",
                        durationPreset: preset.label,
                      }))
                    }
                    className={pillClass(filters.durationPreset === preset.label)}
                  >
                    {preset.label}
                  </button>
                ))}
              {filters.durationMode === "custom" && (
                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="text-xs uppercase tracking-wider text-neutral-400">
                    Min minutes
                    <input
                      type="number"
                      min={0}
                      value={filters.minDurationMinutes}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          durationMode: "custom",
                          minDurationMinutes: Number(event.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                    />
                  </label>
                  <label className="text-xs uppercase tracking-wider text-neutral-400">
                    Max minutes
                    <input
                      type="number"
                      min={0}
                      value={filters.maxDurationMinutes}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          durationMode: "custom",
                          maxDurationMinutes: Number(event.target.value) || 0,
                        }))
                      }
                      className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
                    />
                  </label>
                </div>
              )}
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    durationMode: current.durationMode === "preset" ? "custom" : "preset",
                  }))
                }
                className="text-xs font-medium text-sky-300 hover:text-sky-200"
              >
                {filters.durationMode === "preset" ? "Custom minutes" : "Use presets"}
              </button>
            </div>
          </details>

          <div className="grid grid-cols-1 gap-4 rounded border border-neutral-800 bg-neutral-950/30 p-4 md:grid-cols-3">
            <label className="text-xs uppercase tracking-wider text-neutral-400">
              Min views
              <input
                type="number"
                min={0}
                step={1000}
                value={filters.minViews}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    minViews: Number(event.target.value) || 0,
                  }))
                }
                className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
              />
            </label>
            <label className="text-xs uppercase tracking-wider text-neutral-400">
              Min outlier
              <input
                type="number"
                min={0}
                step={0.5}
                value={filters.minOutlier}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    minOutlier: Number(event.target.value) || 0,
                  }))
                }
                className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
              />
            </label>
            <label className="text-xs uppercase tracking-wider text-neutral-400">
              Sort
              <select
                value={filters.sort}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    sort: event.target.value as SortKey,
                  }))
                }
                className="mt-1 w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm text-neutral-100"
              >
                <option value="outlier">Outlier score</option>
                <option value="views">Views</option>
                <option value="date">Newest</option>
                <option value="subs">Subscribers</option>
              </select>
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={showRevenue}
              onChange={(event) => setShowRevenue(event.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 accent-red-600"
            />
            Show revenue
          </label>
        </div>

        {activeChips.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-2">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 hover:border-red-500"
              >
                {chip.label} <span className="text-neutral-500">x</span>
              </button>
            ))}
          </div>
        )}

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
                  : browseMode
                    ? "Browsing cached database"
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

        {staleCache && (
          <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-100 md:flex-row md:items-center md:justify-between">
            <div>Cached 12h+ ago. Refresh?</div>
            <button
              type="button"
              onClick={() => void search(undefined, true)}
              disabled={loading}
              className="w-fit rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-neutral-950 hover:bg-amber-400 disabled:opacity-50"
            >
              Refresh
            </button>
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
              <table className="w-full min-w-[1320px] text-sm">
                <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-400">
                  <tr>
                    <th className="px-4 py-3">Video</th>
                    <th className="px-4 py-3 text-right">Duration</th>
                    <th className="px-4 py-3 text-right">Views</th>
                    <th className="px-4 py-3 text-right">Outlier</th>
                    <th className="px-4 py-3">Category</th>
                    {showRevenue && <th className="px-4 py-3 text-right">Est. revenue</th>}
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Channel Subs</th>
                    <th className="px-4 py-3 text-right">Trend</th>
                    <th className="px-4 py-3 text-right">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {filtered.map((r) => {
                    const seconds = r.durationSeconds ?? 0;
                    const durationBadge =
                      seconds > 0 && seconds < 60
                        ? { label: "Shorts", className: "bg-orange-500/20 text-orange-300" }
                        : seconds >= 1200
                          ? { label: "Long", className: "bg-neutral-700 text-neutral-200" }
                          : null;
                    return (
                      <tr
                        key={r.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`open ${lastQuery || q || "cached"} niche detail`}
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
                                  className="block max-w-[360px] truncate font-medium hover:text-red-400"
                                >
                                  {r.title}
                                </a>
                              ) : (
                                <div className="max-w-[360px] truncate font-medium">
                                  {r.title}
                                </div>
                              )}
                              <div className="flex items-center gap-1 text-xs text-neutral-400">
                                <span className="max-w-[260px] truncate">{r.channelTitle}</span>
                                {r.isMonetized && (
                                  <span title="Estimated monetized" aria-label="Estimated monetized">
                                    $
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <span className="font-mono text-neutral-300">
                              {formatDurationLabel(seconds)}
                            </span>
                            {durationBadge && (
                              <span
                                className={`rounded px-2 py-0.5 text-xs ${durationBadge.className}`}
                              >
                                {durationBadge.label}
                              </span>
                            )}
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
                        <td className="px-4 py-3">
                          {r.category ? (
                            <span className="inline-flex rounded bg-neutral-800 px-2 py-1 text-xs font-medium capitalize text-neutral-200">
                              {r.category}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-600">-</span>
                          )}
                        </td>
                        {showRevenue && (
                          <td className="px-4 py-3 text-right font-mono text-neutral-300">
                            {typeof r.estimatedRevenueUsd === "number"
                              ? fmtUsd(r.estimatedRevenueUsd)
                              : "-"}
                          </td>
                        )}
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
                              <TrendSparkline trend={r.channelTrend} />
                              {r.channelTrend.direction === "rising"
                                ? "+"
                                : r.channelTrend.direction === "falling"
                                  ? "-"
                                  : "="}{" "}
                              {(r.channelTrend.growth30d * 100).toFixed(0)}%
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-600">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-neutral-400">
                          {daysAgo(r.publishedAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {hasSearched && !loading && results.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
            {browseMode
              ? "No cached videos match these filters. Try relaxing filters or run a keyword search to populate the cache."
              : "No results match these filters. Try relaxing filters."}
          </div>
        )}

        {!hasSearched && !loading && results.length === 0 && !error && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
            Search a niche or apply filters to browse cached videos.
          </div>
        )}
      </div>
    </main>
  );
}
