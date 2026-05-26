import { DURATION_PRESETS, formatDurationLabel } from "./duration";

export const MAX_SUBS = 10_000_000;
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_API_FETCH_SIZE = 50;

export type SortKey = "outlier" | "views" | "date" | "subs";
export type DateMode = "preset" | "custom";
export type VideoFormat = "all" | "standard" | "shorts";

export interface Filters {
  subsMode: DateMode;
  minSubs: number;
  maxSubs: number;
  dateMode: DateMode;
  days: number;
  publishedAfter: string;
  publishedBefore: string;
  durationMode: DateMode;
  durationPreset: string;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  minViews: number;
  minOutlier: number;
  format: VideoFormat;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  subsMode: "preset", minSubs: 0, maxSubs: MAX_SUBS,
  dateMode: "preset", days: 0, publishedAfter: "", publishedBefore: "",
  durationMode: "preset", durationPreset: "Any", minDurationMinutes: 0, maxDurationMinutes: 0,
  minViews: 0, minOutlier: 0, format: "all", sort: "outlier",
};

export const SUB_PRESETS = [
  { label: "All",       min: 0,         max: MAX_SUBS   },
  { label: "<1K",       min: 0,         max: 1_000      },
  { label: "1K-10K",    min: 1_000,     max: 10_000     },
  { label: "10K-100K",  min: 10_000,    max: 100_000    },
  { label: "100K-1M",   min: 100_000,   max: 1_000_000  },
  { label: "1M+",       min: 1_000_000, max: MAX_SUBS   },
];

export const DAYS_OPTIONS = [
  { label: "All time", chip: "All time", value: 0   },
  { label: "3d",       chip: "last 3d",  value: 3   },
  { label: "7d",       chip: "last 7d",  value: 7   },
  { label: "30d",      chip: "last 30d", value: 30  },
  { label: "90d",      chip: "last 90d", value: 90  },
  { label: "1y",       chip: "last 1y",  value: 365 },
];

export const FORMAT_OPTIONS: Array<{ label: string; value: VideoFormat }> = [
  { label: "All videos", value: "all"      },
  { label: "Standard",   value: "standard" },
  { label: "Shorts only", value: "shorts"  },
];

export const EXAMPLE_CHIPS = [
  "AI takeover documentary",
  "faceless finance",
  "history shorts",
  "ancient engineering",
  "stoicism explained",
  "self-improvement micro",
];

export const fmt = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

export const daysAgo = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

export const cacheAgeLabel = (iso: string): string => {
  const ageMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "just now";
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const csvCell = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};

export const downloadCsv = (filename: string, rows: Array<Record<string, string | number | null | undefined>>): void => {
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

export function hydrateFilters(params: URLSearchParams): { q: string; filters: Filters } {
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

export function buildSearchParams(
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

export function paramsToJson(params: URLSearchParams): Record<string, string> {
  return Object.fromEntries(
    Array.from(params.entries()).filter(
      ([k]) => !["max", "force", "forceRefresh", "page", "pageSize", "apiFetchSize"].includes(k),
    ),
  );
}

export function jsonToParams(value: Record<string, unknown>, keyword?: string): URLSearchParams {
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

export function defaultSavedSearchLabel(q: string, filters: Filters): string {
  const query = q.trim();
  const parts = activeFilterLabels(filters);
  if (query && parts.length > 0) return `${query} (${parts.slice(0, 2).join(", ")})`;
  if (query) return query;
  if (parts.length > 0) return `Browse: ${parts.slice(0, 2).join(", ")}`;
  return "Cached browse";
}

export function sameSearch(a: URLSearchParams, b: URLSearchParams): boolean {
  for (const key of ["max", "force", "forceRefresh", "page", "pageSize", "apiFetchSize"]) {
    a.delete(key); b.delete(key);
  }
  return a.toString() === b.toString();
}

export function activeFilterLabels(filters: Filters): string[] {
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

export function activeFilterChips(filters: Filters, setFilters: (fn: (f: Filters) => Filters) => void) {
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
}

export function buildExportRows(videos: Array<{
  title: string; channelTitle: string; views: number; outlierScore: number;
  outlierReason?: string; channelSubs: number; category?: string | null;
  estimatedRevenueUsd?: number; durationSeconds?: number; publishedAt: string; id: string;
}>, source: string | null) {
  return videos.map((v) => ({
    title: v.title, channel: v.channelTitle, views: v.views,
    outlier: v.outlierScore.toFixed(2), reason: v.outlierReason ?? "",
    subs: v.channelSubs, category: v.category ?? "",
    estimated_revenue_usd: typeof v.estimatedRevenueUsd === "number" ? Math.round(v.estimatedRevenueUsd) : "",
    duration: formatDurationLabel(v.durationSeconds ?? 0), age: daysAgo(v.publishedAt),
    video_url: source === "mock" ? "" : `https://youtube.com/watch?v=${v.id}`,
  }));
}
