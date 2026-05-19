"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { SaturationReport } from "@/lib/saturation";
import { slugifyNiche } from "@/lib/niche-utils";
import type { EnrichedVideo, QuotaUsage, SearchSource } from "@/lib/search-types";
import { DURATION_PRESETS, formatDurationLabel } from "@/lib/duration";
import type { SavedSearch } from "@/lib/saved-searches";
import { useKeyboardShortcuts } from "@/lib/keyboard";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { NavBar } from "@/app/components/NavBar";
import { NicheOverview } from "@/app/components/NicheOverview";
import { FilterSidebar } from "@/app/components/FilterSidebar";
import { ResultsTable } from "@/app/components/ResultsTable";
import { SatBadge, Spinner } from "@/app/components/ui";

// ─── Types (unchanged from original) ─────────────────────────────────────────

type SortKey = "outlier" | "views" | "date" | "subs";
type Mode = "preset" | "custom";
type VideoFormat = "all" | "standard" | "shorts";

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
  format: VideoFormat;
  sort: SortKey;
}

interface SearchResponse {
  results: EnrichedVideo[];
  saturation?: SaturationReport;
  source?: SearchSource;
  fallbackReason?: string;
  refreshReason?: string;
  quota?: QuotaUsage;
  quotaUnits?: number;
  fetchedAt?: string;
  browseMode?: boolean;
  totalCount?: number;
  page?: number;
  pageSize?: number;
  hasMore?: boolean;
  dbMatchCount?: number;
}

interface SavedSearchesResponse {
  savedSearches?: SavedSearch[];
  error?: string;
}

// ─── Constants (unchanged) ────────────────────────────────────────────────────

const MAX_SUBS = 10_000_000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_API_FETCH_SIZE = 50;

const DEFAULT_FILTERS: Filters = {
  subsMode: "preset", minSubs: 0, maxSubs: MAX_SUBS,
  dateMode: "preset", days: 0, publishedAfter: "", publishedBefore: "",
  durationMode: "preset", durationPreset: "Any", minDurationMinutes: 0, maxDurationMinutes: 0,
  minViews: 0, minOutlier: 0, format: "all", sort: "outlier",
};

const SUB_PRESETS = [
  { label: "All",       min: 0,         max: MAX_SUBS   },
  { label: "<1K",       min: 0,         max: 1_000      },
  { label: "1K-10K",    min: 1_000,     max: 10_000     },
  { label: "10K-100K",  min: 10_000,    max: 100_000    },
  { label: "100K-1M",   min: 100_000,   max: 1_000_000  },
  { label: "1M+",       min: 1_000_000, max: MAX_SUBS   },
];

const DAYS_OPTIONS = [
  { label: "All time", chip: "All time", value: 0   },
  { label: "3d",       chip: "last 3d",  value: 3   },
  { label: "7d",       chip: "last 7d",  value: 7   },
  { label: "30d",      chip: "last 30d", value: 30  },
  { label: "90d",      chip: "last 90d", value: 90  },
  { label: "1y",       chip: "last 1y",  value: 365 },
];

const FORMAT_OPTIONS: Array<{ label: string; value: VideoFormat }> = [
  { label: "All videos", value: "all"      },
  { label: "Standard",   value: "standard" },
  { label: "Shorts only",value: "shorts"   },
];

const EXAMPLE_CHIPS = [
  "AI takeover documentary",
  "faceless finance",
  "history shorts",
  "ancient engineering",
  "stoicism explained",
  "self-improvement micro",
];

// ─── Utilities (unchanged) ────────────────────────────────────────────────────

const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

const csvCell = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

const daysAgo = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

const cacheAgeLabel = (iso: string): string => {
  const ageMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "just now";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const downloadCsv = (filename: string, rows: Array<Record<string, string | number | null | undefined>>): void => {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.map(csvCell).join(","), ...rows.map((row) => headers.map((h) => csvCell(row[h])).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
};

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
  DURATION_PRESETS.find((p) => p.label === label) ?? DURATION_PRESETS[0];

const normalizeRange = (min: number, max: number): [number, number] =>
  max > 0 && min > max ? [max, min] : [min, max];

function hydrateFilters(params: URLSearchParams): { q: string; filters: Filters } {
  const filters = { ...DEFAULT_FILTERS };
  const minSubs = finiteParam(params, "minSubs");
  const maxSubs = finiteParam(params, "maxSubs");
  if (minSubs !== null || maxSubs !== null) {
    filters.minSubs = minSubs ?? 0;
    filters.maxSubs = maxSubs ?? MAX_SUBS;
    filters.subsMode = SUB_PRESETS.some((p) => p.min === filters.minSubs && p.max === filters.maxSubs) ? "preset" : "custom";
  }
  const days = finiteParam(params, "days");
  const publishedAfter = dateParam(params.get("publishedAfter"));
  const publishedBefore = dateParam(params.get("publishedBefore"));
  if (publishedAfter || publishedBefore) {
    filters.dateMode = "custom"; filters.publishedAfter = publishedAfter; filters.publishedBefore = publishedBefore;
  } else if (days !== null) { filters.days = days; }
  const minDurationSeconds = finiteParam(params, "minDurationSeconds");
  const maxDurationSeconds = finiteParam(params, "maxDurationSeconds");
  if (minDurationSeconds !== null || maxDurationSeconds !== null) {
    const preset = DURATION_PRESETS.find((item) =>
      item.minSeconds === (minDurationSeconds ?? 0) &&
      ((!Number.isFinite(item.maxSeconds) && maxDurationSeconds === null) || item.maxSeconds === maxDurationSeconds),
    );
    if (preset) { filters.durationPreset = preset.label; }
    else {
      filters.durationMode = "custom";
      filters.minDurationMinutes = Math.round((minDurationSeconds ?? 0) / 60);
      filters.maxDurationMinutes = Math.round((maxDurationSeconds ?? 0) / 60);
    }
  }
  filters.minViews = finiteParam(params, "minViews") ?? 0;
  filters.minOutlier = finiteParam(params, "minOutlier") ?? 0;
  const format = params.get("format");
  if (format === "standard" || format === "shorts") filters.format = format;
  const sort = params.get("sort");
  if (sort === "views" || sort === "date" || sort === "subs") filters.sort = sort;
  return { q: params.get("q") ?? "", filters };
}

function buildSearchParams(
  q: string,
  filters: Filters,
  forceRefresh = false,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): URLSearchParams {
  const params = new URLSearchParams({ pageSize: String(pageSize) });
  const query = q.trim();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  if (forceRefresh) {
    params.set("forceRefresh", "1");
    params.set("apiFetchSize", String(DEFAULT_API_FETCH_SIZE));
  }
  if (filters.minSubs > 0) params.set("minSubs", String(filters.minSubs));
  if (filters.maxSubs < MAX_SUBS) params.set("maxSubs", String(filters.maxSubs));
  if (filters.minViews > 0) params.set("minViews", String(filters.minViews));
  if (filters.minOutlier > 0) params.set("minOutlier", String(filters.minOutlier));
  if (filters.format !== "all") params.set("format", filters.format);
  if (filters.sort !== "outlier") params.set("sort", filters.sort);
  if (filters.dateMode === "preset") {
    if (filters.days > 0) params.set("days", String(filters.days));
  } else {
    let after = filters.publishedAfter, before = filters.publishedBefore;
    if (after && before && after > before) [after, before] = [before, after];
    if (after) params.set("publishedAfter", after);
    if (before) params.set("publishedBefore", before);
  }
  if (filters.durationMode === "preset") {
    const preset = durationPresetByLabel(filters.durationPreset);
    if (preset.label !== "Any") {
      params.set("minDurationSeconds", String(preset.minSeconds));
      if (Number.isFinite(preset.maxSeconds)) params.set("maxDurationSeconds", String(preset.maxSeconds));
    }
  } else {
    const [min, max] = normalizeRange(filters.minDurationMinutes, filters.maxDurationMinutes);
    if (min > 0) params.set("minDurationSeconds", String(min * 60));
    if (max > 0) params.set("maxDurationSeconds", String(max * 60));
  }
  return params;
}

function paramsToJson(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(
    Array.from(params.entries()).filter(
      ([k]) => !["max", "force", "forceRefresh", "page", "pageSize", "apiFetchSize"].includes(k),
    ),
  );
}

function jsonToParams(value: Record<string, unknown>, keyword?: string): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, item] of Object.entries(value)) {
    if (key === "max" || key === "force") continue;
    if (typeof item === "string" && item.trim()) params.set(key, item);
    if (typeof item === "number" && Number.isFinite(item)) params.set(key, String(item));
    if (typeof item === "boolean") params.set(key, item ? "1" : "0");
  }
  if (!params.get("q") && keyword) params.set("q", keyword);
  return params;
}

function defaultSavedSearchLabel(q: string, filters: Filters): string {
  const query = q.trim();
  const parts = activeFilterLabels(filters);
  if (query && parts.length > 0) return `${query} (${parts.slice(0, 2).join(", ")})`;
  if (query) return query;
  if (parts.length > 0) return `Browse: ${parts.slice(0, 2).join(", ")}`;
  return "Cached browse";
}

function sameSearch(a: URLSearchParams, b: URLSearchParams): boolean {
  for (const key of ["max", "force", "forceRefresh", "page", "pageSize", "apiFetchSize"]) {
    a.delete(key); b.delete(key);
  }
  return a.toString() === b.toString();
}

function activeFilterLabels(filters: Filters): string[] {
  const labels: string[] = [];
  const subPreset = SUB_PRESETS.find((p) => p.min === filters.minSubs && p.max === filters.maxSubs);
  if (filters.minSubs > 0 || filters.maxSubs < MAX_SUBS)
    labels.push(`Subs ${subPreset?.label ?? `${fmt(filters.minSubs)}-${fmt(filters.maxSubs)}`}`);
  if (filters.dateMode === "preset" && filters.days > 0) {
    const option = DAYS_OPTIONS.find((o) => o.value === filters.days);
    labels.push(option?.chip ?? `last ${filters.days}d`);
  }
  if (filters.dateMode === "custom" && (filters.publishedAfter || filters.publishedBefore))
    labels.push(`${filters.publishedAfter || "Any"} to ${filters.publishedBefore || "Any"}`);
  if (filters.durationMode === "preset" && filters.durationPreset !== "Any")
    labels.push(filters.durationPreset);
  if (filters.durationMode === "custom" && (filters.minDurationMinutes > 0 || filters.maxDurationMinutes > 0))
    labels.push(`${filters.minDurationMinutes || 0}-${filters.maxDurationMinutes || "any"}m`);
  if (filters.minViews > 0) labels.push(`${fmt(filters.minViews)}+ views`);
  if (filters.minOutlier > 0) labels.push(`${filters.minOutlier}x+ outlier`);
  if (filters.format !== "all") labels.push(FORMAT_OPTIONS.find((o) => o.value === filters.format)?.label ?? filters.format);
  return labels;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SearchPageClient({
  adminShortcutsEnabled = false,
  userEmail,
  userAvatarUrl,
}: {
  adminShortcutsEnabled?: boolean;
  userEmail?: string;
  userAvatarUrl?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(() => hydrateFilters(new URLSearchParams(searchParams.toString())).q);
  const [lastQuery, setLastQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<EnrichedVideo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [resultPage, setResultPage] = useState(1);
  const [resultPageSize, setResultPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [saturation, setSaturation] = useState<SaturationReport | null>(null);
  const [source, setSource] = useState<SearchSource | null>(null);
  const [browseMode, setBrowseMode] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => hydrateFilters(new URLSearchParams(searchParams.toString())).filters);
  const [quota, setQuota] = useState<QuotaUsage | null>(null);
  const [showRevenue, setShowRevenue] = useState(false);
  const [staleCache, setStaleCache] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hydrated = useRef(true);
  const autoSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  useKeyboardShortcuts({
    adminEnabled: adminShortcutsEnabled,
    onFocusSearch: focusSearch,
    onEscape: () => { setFiltersOpen(false); setSavedOpen(false); },
    onAdminSeeds: () => router.push("/admin/seeds"),
    onAdminAlerts: () => router.push("/admin/alerts"),
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quota")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: QuotaUsage | null) => { if (!cancelled && data) setQuota(data); })
      .catch(() => { if (!cancelled) setQuota(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/saved-searches")
      .then((res) => res.json().then((data: SavedSearchesResponse) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Unable to load saved searches");
        setSavedSearches(data.savedSearches ?? []);
      })
      .catch((err) => { if (!cancelled) setSavedError(err instanceof Error ? err.message : "Unable to load saved searches"); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    const next = buildSearchParams(q, filters);
    const current = new URLSearchParams(searchParams.toString());
    if (sameSearch(new URLSearchParams(next), current)) return;
    const queryString = next.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  }, [filters, pathname, q, router, searchParams]);

  const search = useCallback(async (
    event?: FormEvent,
    forceRefresh = false,
    searchQ = q,
    searchFilters = filters,
    requestedPage = 1,
    append = false,
  ): Promise<void> => {
    event?.preventDefault();
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const params = buildSearchParams(
        searchQ,
        searchFilters,
        forceRefresh,
        requestedPage,
        DEFAULT_PAGE_SIZE,
      );
      const res = await fetch(`/api/search?${params}`);
      const data = (await res.json()) as SearchResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "search failed");

      setResults((current) => {
        if (!append) return data.results;
        const merged = new Map(current.map((video) => [video.id, video]));
        for (const video of data.results) merged.set(video.id, video);
        return [...merged.values()];
      });
      if (!append) setSaturation(data.saturation ?? null);
      setSource(data.source ?? null);
      setBrowseMode(data.browseMode === true);
      setFallbackReason(data.fallbackReason ?? data.refreshReason ?? null);
      setQuota(data.quota ?? null);
      setLastFetchedAt(data.fetchedAt ?? null);
      setTotalCount(data.totalCount ?? data.results.length);
      setResultPage(data.page ?? requestedPage);
      setResultPageSize(data.pageSize ?? DEFAULT_PAGE_SIZE);
      setHasMore(data.hasMore === true);
      setStaleCache(false);
      setLastQuery(searchQ.trim());
      setHasSearched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
      if (!append) {
        setResults([]); setSaturation(null); setSource(null);
        setBrowseMode(false); setFallbackReason(null); setStaleCache(false); setLastFetchedAt(null);
        setTotalCount(0); setResultPage(1); setHasMore(false);
      }
      setHasSearched(true);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [filters, q]);

  useEffect(() => {
    if (!hasSearched) return;
    if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current);
    autoSearchTimer.current = setTimeout(() => { void search(undefined, false, q, filters, 1, false); }, 350);
    return () => { if (autoSearchTimer.current) clearTimeout(autoSearchTimer.current); };
  }, [filters, hasSearched, q, search]);

  const nicheHref = useMemo(() => {
    const keyword = lastQuery || q.trim();
    const slug = slugifyNiche(keyword || "cached-browse");
    return keyword ? `/niche/${slug}?q=${encodeURIComponent(keyword)}` : `/niche/${slug}`;
  }, [lastQuery, q]);

  const loadedResults = results;

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    const subPreset = SUB_PRESETS.find((p) => p.min === filters.minSubs && p.max === filters.maxSubs);
    if (filters.minSubs > 0 || filters.maxSubs < MAX_SUBS)
      chips.push({ key: "subs", label: `Subs: ${subPreset?.label ?? `${fmt(filters.minSubs)}-${fmt(filters.maxSubs)}`}`, clear: () => setFilters((c) => ({ ...c, subsMode: "preset", minSubs: 0, maxSubs: MAX_SUBS })) });
    if (filters.dateMode === "preset" && filters.days > 0) {
      const option = DAYS_OPTIONS.find((o) => o.value === filters.days);
      chips.push({ key: "date", label: `Date: ${option?.chip ?? `last ${filters.days}d`}`, clear: () => setFilters((c) => ({ ...c, days: 0 })) });
    }
    if (filters.minViews > 0) chips.push({ key: "views", label: `Min views: ${fmt(filters.minViews)}`, clear: () => setFilters((c) => ({ ...c, minViews: 0 })) });
    if (filters.minOutlier > 0) chips.push({ key: "outlier", label: `Min outlier: ${filters.minOutlier}x`, clear: () => setFilters((c) => ({ ...c, minOutlier: 0 })) });
    if (filters.durationMode === "preset" && filters.durationPreset !== "Any")
      chips.push({ key: "duration", label: `Duration: ${filters.durationPreset}`, clear: () => setFilters((c) => ({ ...c, durationMode: "preset", durationPreset: "Any" })) });
    if (filters.durationMode === "custom" && (filters.minDurationMinutes > 0 || filters.maxDurationMinutes > 0))
      chips.push({ key: "duration", label: `Duration: ${filters.minDurationMinutes || 0}-${filters.maxDurationMinutes || "any"}m`, clear: () => setFilters((c) => ({ ...c, durationMode: "preset", durationPreset: "Any", minDurationMinutes: 0, maxDurationMinutes: 0 })) });
    if (filters.format !== "all") {
      const fo = FORMAT_OPTIONS.find((o) => o.value === filters.format);
      chips.push({ key: "format", label: `Format: ${fo?.label ?? filters.format}`, clear: () => setFilters((c) => ({ ...c, format: "all" })) });
    }
    return chips;
  }, [filters]);

  const saveCurrentSearch = async (): Promise<void> => {
    setSavingSearch(true); setSavedNotice(null); setSavedError(null);
    try {
      const params = buildSearchParams(q, filters);
      const res = await fetch("/api/saved-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: defaultSavedSearchLabel(q, filters), keyword: q.trim() || undefined, filtersJson: paramsToJson(params) }),
      });
      const data = (await res.json()) as SavedSearchesResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to save search");
      setSavedSearches(data.savedSearches ?? []);
      setSavedNotice("Search saved.");
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : "Unable to save search");
    } finally { setSavingSearch(false); }
  };

  const deleteSavedSearch = async (id: string): Promise<void> => {
    setSavedNotice(null); setSavedError(null);
    try {
      const res = await fetch(`/api/saved-searches?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json()) as SavedSearchesResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to delete saved search");
      setSavedSearches(data.savedSearches ?? []);
    } catch (err) {
      setSavedError(err instanceof Error ? err.message : "Unable to delete saved search");
    }
  };

  const openSavedSearch = async (saved: SavedSearch): Promise<void> => {
    const params = jsonToParams(saved.filtersJson, saved.keyword);
    const hydratedSearch = hydrateFilters(params);
    const nextParams = buildSearchParams(hydratedSearch.q, hydratedSearch.filters);
    const queryString = nextParams.toString();
    setQ(hydratedSearch.q);
    setFilters(hydratedSearch.filters);
    setSavedNotice(null); setSavedError(null);
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    if (!hasSearched) void search(undefined, false, hydratedSearch.q, hydratedSearch.filters);
    try {
      const res = await fetch("/api/saved-searches", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: saved.id }) });
      const data = (await res.json()) as SavedSearchesResponse;
      if (res.ok) setSavedSearches(data.savedSearches ?? []);
    } catch { /* non-blocking */ }
  };

  const signOut = async (): Promise<void> => {
    const supabase = getSupabaseBrowser();
    await supabase?.auth.signOut();
    router.refresh();
  };

  const exportCsv = (): void => {
    const keyword = (lastQuery || q.trim() || "cached-browse").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const today = new Date().toISOString().slice(0, 10);
    downloadCsv(`nichefinder-${keyword || "results"}-${today}.csv`, loadedResults.map((v) => ({
      title: v.title, channel: v.channelTitle, views: v.views,
      outlier: v.outlierScore.toFixed(2), reason: v.outlierReason,
      subs: v.channelSubs, category: v.category ?? "",
      estimated_revenue_usd: typeof v.estimatedRevenueUsd === "number" ? Math.round(v.estimatedRevenueUsd) : "",
      duration: formatDurationLabel(v.durationSeconds ?? 0), age: daysAgo(v.publishedAt),
      video_url: source === "mock" ? "" : `https://youtube.com/watch?v=${v.id}`,
    })));
  };

  const canForceRefresh = q.trim().length > 0 && !loading && !loadingMore;
  const isUrl = q.includes("youtube.com") || q.includes("youtu.be");

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Nav */}
      <NavBar
        quotaUsed={quota?.used}
        quotaLimit={quota?.limit}
        userEmail={userEmail}
        userAvatarUrl={userAvatarUrl}
        onSignOut={() => void signOut()}
      />

      {/* Sticky search bar */}
      <div className="sticky top-12 z-30 border-b border-neutral-800/60 bg-neutral-950/90 backdrop-blur-sm">
        <div className="mx-auto max-w-screen-xl px-5 py-2.5">
          <form onSubmit={(e) => void search(e)} className="flex items-center gap-2">
            <div className={`relative flex flex-1 items-center overflow-hidden rounded-md border transition-colors ${
              isUrl ? "border-cyan-500/40 focus-within:border-cyan-400/60" : "border-neutral-700 focus-within:border-red-500/50"
            } bg-neutral-900`}>
              <div className="flex-shrink-0 pl-3 text-neutral-600">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <input
                ref={searchInputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search niche or paste YouTube URL…"
                className="flex-1 bg-transparent px-2.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none font-sans"
              />
              {isUrl && (
                <span className="mr-2 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400">
                  URL
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs font-medium text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1 2.5h10M3 6h6M5 9.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              Filters
              {activeChips.length > 0 && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white font-bold">
                  {activeChips.length}
                </span>
              )}
            </button>

            <button
              type="submit"
              disabled={loading}
              className="rounded bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
            >
              {loading ? "…" : isUrl ? "Analyze" : "Search"}
            </button>

            {canForceRefresh && (
              <button
                type="button"
                onClick={() => void search(undefined, true)}
                disabled={loading || loadingMore}
                className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs font-medium text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50 transition-colors"
              >
                ↻
              </button>
            )}
          </form>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.clear}
                  className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-0.5 text-[11px] text-neutral-300 hover:border-red-500 transition-colors"
                >
                  {chip.label}
                  <span className="text-neutral-500">×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-screen-xl px-5 py-5 space-y-4">

        {/* Error banner */}
        {error && (
          <div className="rounded-md border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            Error: {error}
          </div>
        )}

        {/* Source / cache banner */}
        {source && (
          <div className={`rounded-md border px-4 py-2.5 text-xs flex items-center justify-between gap-3 ${
            source === "mock"  ? "border-amber-900 bg-amber-950/30 text-amber-200"
            : source === "database_youtube_refresh" ? "border-sky-900 bg-sky-950/20 text-sky-200"
            : "border-emerald-900 bg-emerald-950/20 text-emerald-200"
          }`}>
            <div>
              <span className="font-semibold">
                {source === "mock"
                  ? "Mock data"
                  : source === "database_youtube_refresh"
                    ? "Database + YouTube refresh"
                    : source === "youtube_refresh"
                      ? "YouTube refresh"
                      : browseMode ? "Browsing database" : "Database"}
              </span>
              {lastFetchedAt && <span className="ml-2 opacity-70">· fetched {cacheAgeLabel(lastFetchedAt)}</span>}
              {fallbackReason && <span className="ml-2 opacity-70">· {fallbackReason}</span>}
            </div>
            {staleCache && (
              <button
                type="button"
                onClick={() => void search(undefined, true)}
                disabled={!canForceRefresh}
                className="rounded border border-sky-700 px-2.5 py-1 text-[11px] font-semibold hover:border-sky-400 disabled:opacity-50 transition-colors"
              >
                Refresh
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {!hasSearched && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 text-4xl text-neutral-800">◉</div>
            <h2 className="text-base font-semibold text-neutral-300">Find your niche</h2>
            <p className="mt-2 max-w-sm text-sm text-neutral-500">
              Search a keyword, topic, or paste a YouTube URL to analyze saturation, outliers, and revenue.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {EXAMPLE_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => { setQ(chip); void search(undefined, false, chip, filters); }}
                  className="rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Spinner className="h-6 w-6" />
            <span className="text-sm text-neutral-500">
              {q.trim()
                ? <>Searching database for <span className="font-mono text-neutral-400">&ldquo;{q}&rdquo;</span>...</>
                : "Browsing database..."}
            </span>
          </div>
        )}

        {/* Results */}
        {!loading && hasSearched && (
          <>
            {/* Query header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-sm font-semibold text-neutral-100">
                  {lastQuery ? (
                    <><span className="text-neutral-500 font-normal">Results for </span>&ldquo;{lastQuery}&rdquo;</>
                  ) : (
                    <span className="text-neutral-500">Browsing cached database</span>
                  )}
                </h2>
                {saturation && <SatBadge level={saturation.level} />}
                {loadedResults.length > 0 && (
                  <span className="font-mono text-[11px] text-neutral-500">
                    showing {loadedResults.length} of {totalCount.toLocaleString()} videos
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Link href={nicheHref} className="rounded border border-neutral-700 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors">
                  Niche page →
                </Link>
                <button
                  type="button"
                  onClick={() => void saveCurrentSearch()}
                  disabled={savingSearch}
                  className="rounded border border-neutral-700 px-2.5 py-1.5 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50 transition-colors"
                >
                  {savingSearch ? "Saving…" : "+ Save search"}
                </button>
              </div>
            </div>

            {/* Save notice / error */}
            {savedNotice && (
              <div className="rounded-md border border-emerald-900 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">{savedNotice}</div>
            )}
            {savedError && (
              <div className="rounded-md border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-200">{savedError}</div>
            )}

            {/* Overview + Saturation */}
            {saturation && (
              <NicheOverview saturation={saturation} query={lastQuery || "browse"} />
            )}

            {/* Results table */}
            {loadedResults.length > 0 ? (
              <>
                <ResultsTable
                  videos={loadedResults}
                  showRevenue={showRevenue}
                  source={source}
                  totalCount={totalCount}
                  pageSize={resultPageSize}
                  onExportCsv={exportCsv}
                />
                {hasMore && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => void search(undefined, false, lastQuery, filters, resultPage + 1, true)}
                      disabled={loadingMore}
                      className="rounded border border-neutral-700 bg-neutral-900 px-4 py-2 text-xs font-semibold text-neutral-300 hover:border-neutral-600 hover:text-neutral-100 disabled:opacity-50 transition-colors"
                    >
                      {loadingMore ? "Loading..." : "Load more"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-md border border-neutral-800 bg-neutral-900/40 py-16 text-center">
                <div className="text-2xl text-neutral-700 mb-2">≋</div>
                <div className="text-sm text-neutral-500">No videos match the current filters.</div>
              </div>
            )}
          </>
        )}

        {/* Saved searches drawer */}
        {savedOpen && (
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-neutral-800 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
              <span className="text-sm font-semibold">Saved Searches</span>
              <button type="button" onClick={() => setSavedOpen(false)} className="text-neutral-500 hover:text-neutral-200">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {savedSearches.length === 0 ? (
                <div className="rounded border border-dashed border-neutral-800 px-3 py-8 text-center text-xs text-neutral-500">
                  No saved searches yet.
                </div>
              ) : (
                savedSearches.map((saved) => (
                  <div key={saved.id} className="group rounded border border-neutral-800 bg-neutral-900/40 p-3">
                    <button type="button" onClick={() => void openSavedSearch(saved)} className="block w-full text-left">
                      <span className="block truncate text-xs font-medium text-neutral-100 group-hover:text-red-300 transition-colors">
                        {saved.label}
                      </span>
                      <span className="mt-1 block truncate text-[11px] text-neutral-500">
                        {saved.keyword || "Browse mode"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSavedSearch(saved.id)}
                      className="mt-2 text-[11px] font-medium text-neutral-500 hover:text-red-300 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Filter sidebar */}
      <FilterSidebar
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        setFilters={setFilters}
        showRevenue={showRevenue}
        setShowRevenue={setShowRevenue}
      />
    </div>
  );
}
