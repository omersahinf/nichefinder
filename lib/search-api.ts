import type { EnrichedVideo } from "./search-types";
import { matchesVideoFormat, type VideoFormatFilter } from "./video-format";

export type SortKey = "outlier" | "views" | "date" | "subs";

export interface ParsedSearchRequest {
  q?: string;
  maxResults: number;
  days: number;
  forceRefresh: boolean;
  page: number;
  pageSize: number;
  apiFetchSize: number;
  filterParams: {
    minSubs?: number;
    maxSubs?: number;
    minViews?: number;
    minOutlier?: number;
    publishedAfter?: string;
    publishedBefore?: string;
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
    format?: VideoFormatFilter;
    sort: SortKey;
  };
}

const finiteNumber = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const boundedInteger = (
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
};

const isoStart = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const candidate = value.includes("T") ? value : `${value}T00:00:00.000Z`;
  const time = new Date(candidate).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};

const isoEnd = (value: string | null): string | undefined => {
  if (!value) return undefined;
  const candidate = value.includes("T") ? value : `${value}T23:59:59.999Z`;
  const time = new Date(candidate).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : undefined;
};

export const sortValue = (value: string | null): SortKey => {
  if (value === "views" || value === "date" || value === "subs") return value;
  return "outlier";
};

export const formatValue = (value: string | null): VideoFormatFilter => {
  if (value === "shorts" || value === "standard") return value;
  return "all";
};

export function parseSearchRequest(params: URLSearchParams): ParsedSearchRequest {
  const q = params.get("q")?.trim() || undefined;
  const page = boundedInteger(params.get("page"), 1, 1, 10_000);
  const pageSize = boundedInteger(params.get("pageSize") ?? params.get("max"), 100, 1, 500);
  const apiFetchSize = boundedInteger(params.get("apiFetchSize") ?? params.get("max"), 50, 1, 200);
  const maxResults = apiFetchSize;
  const requestedDays = Number(params.get("days") ?? 0);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : 0;
  const forceRefresh = params.get("forceRefresh") === "1" || params.get("force") === "1";
  const minSubs = finiteNumber(params.get("minSubs"));
  const maxSubs = finiteNumber(params.get("maxSubs"));
  const minViews = finiteNumber(params.get("minViews"));
  const minOutlier = finiteNumber(params.get("minOutlier"));
  const minDurationSeconds = finiteNumber(params.get("minDurationSeconds"));
  const maxDurationSeconds = finiteNumber(params.get("maxDurationSeconds"));
  const sort = sortValue(params.get("sort"));
  const format = formatValue(params.get("format"));

  const explicitPublishedAfter = isoStart(params.get("publishedAfter"));
  const publishedAfter =
    explicitPublishedAfter ??
    (days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : undefined);
  const publishedBefore = isoEnd(params.get("publishedBefore"));

  return {
    q,
    maxResults,
    days,
    forceRefresh,
    page,
    pageSize,
    apiFetchSize,
    filterParams: {
      minSubs,
      maxSubs,
      minViews,
      minOutlier,
      publishedAfter,
      publishedBefore,
      minDurationSeconds,
      maxDurationSeconds,
      format,
      sort,
    },
  };
}

export function applySearchFilters(
  results: EnrichedVideo[],
  filters: ParsedSearchRequest["filterParams"],
): EnrichedVideo[] {
  const list = results.filter((video) => {
    if (filters.minSubs !== undefined && video.channelSubs < filters.minSubs) return false;
    if (filters.maxSubs !== undefined && video.channelSubs > filters.maxSubs) return false;
    if (filters.minViews !== undefined && video.views < filters.minViews) return false;
    if (filters.minOutlier !== undefined && video.outlierScore < filters.minOutlier) {
      return false;
    }
    if (
      filters.publishedAfter &&
      new Date(video.publishedAt).getTime() < new Date(filters.publishedAfter).getTime()
    ) {
      return false;
    }
    if (
      filters.publishedBefore &&
      new Date(video.publishedAt).getTime() > new Date(filters.publishedBefore).getTime()
    ) {
      return false;
    }
    if (
      filters.minDurationSeconds !== undefined &&
      (video.durationSeconds ?? 0) < filters.minDurationSeconds
    ) {
      return false;
    }
    if (
      filters.maxDurationSeconds !== undefined &&
      Number.isFinite(filters.maxDurationSeconds) &&
      (video.durationSeconds ?? 0) > filters.maxDurationSeconds
    ) {
      return false;
    }
    if (!matchesVideoFormat(video, filters.format)) return false;
    return true;
  });

  return [...list].sort((a, b) => {
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
}
