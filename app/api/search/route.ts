import { NextRequest, NextResponse } from "next/server";
import { searchAndEnrich } from "@/lib/youtube";
import { computeSaturation } from "@/lib/saturation";
import {
  browseCachedVideos,
  getTodayQuotaUsage,
  isQuotaGuardActive,
  logSearch,
  recordApiUsage,
} from "@/lib/cache";
import type { EnrichedVideo } from "@/lib/search-types";

type SortKey = "outlier" | "views" | "date" | "subs";

const finiteNumber = (value: string | null): number | undefined => {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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

const sortValue = (value: string | null): SortKey => {
  if (value === "views" || value === "date" || value === "subs") return value;
  return "outlier";
};

const applyFilters = (
  results: EnrichedVideo[],
  filters: {
    minSubs?: number;
    maxSubs?: number;
    minViews?: number;
    minOutlier?: number;
    publishedAfter?: string;
    publishedBefore?: string;
    minDurationSeconds?: number;
    maxDurationSeconds?: number;
    sort: SortKey;
  },
): EnrichedVideo[] => {
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
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const requestedMax = Number(req.nextUrl.searchParams.get("max") ?? 25);
  const maxResults = Number.isFinite(requestedMax)
    ? Math.min(Math.max(requestedMax, 5), 50)
    : 25;
  const requestedDays = Number(req.nextUrl.searchParams.get("days") ?? 0);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : 0;
  const forceRefresh = req.nextUrl.searchParams.get("force") === "1";
  const minSubs = finiteNumber(req.nextUrl.searchParams.get("minSubs"));
  const maxSubs = finiteNumber(req.nextUrl.searchParams.get("maxSubs"));
  const minViews = finiteNumber(req.nextUrl.searchParams.get("minViews"));
  const minOutlier = finiteNumber(req.nextUrl.searchParams.get("minOutlier"));
  const minDurationSeconds = finiteNumber(
    req.nextUrl.searchParams.get("minDurationSeconds"),
  );
  const maxDurationSeconds = finiteNumber(
    req.nextUrl.searchParams.get("maxDurationSeconds"),
  );
  const sort = sortValue(req.nextUrl.searchParams.get("sort"));

  const explicitPublishedAfter = isoStart(req.nextUrl.searchParams.get("publishedAfter"));
  const publishedAfter =
    explicitPublishedAfter ??
    (days > 0 ? new Date(Date.now() - days * 86400000).toISOString() : undefined);
  const publishedBefore = isoEnd(req.nextUrl.searchParams.get("publishedBefore"));
  const filterParams = {
    minSubs,
    maxSubs,
    minViews,
    minOutlier,
    publishedAfter,
    publishedBefore,
    minDurationSeconds,
    maxDurationSeconds,
    sort,
  };

  try {
    if (!q) {
      const results = await browseCachedVideos({ ...filterParams, limit: 100 });
      const saturation = computeSaturation(results);

      return NextResponse.json({
        query: "",
        count: results.length,
        source: "cache",
        browseMode: true,
        results,
        saturation,
        quota: await getTodayQuotaUsage(),
      });
    }

    const quotaBefore = await getTodayQuotaUsage();
    const { results: rawResults, source, fallbackReason, cacheHit, quotaUnits = 0, fetchedAt } =
      await searchAndEnrich(q, maxResults, {
        publishedAfter,
        publishedBefore,
        days,
        filterLog: filterParams,
        forceMock: isQuotaGuardActive(quotaBefore),
        forceRefresh,
      });
    const results = applyFilters(rawResults, filterParams);

    await recordApiUsage(quotaUnits, {
      query: q,
      maxResults,
      days,
      source,
      ...filterParams,
    });
    await logSearch(
      q,
      {
        maxResults,
        days,
        forceRefresh,
        ...filterParams,
        publishedAfter: publishedAfter ?? null,
        publishedBefore: publishedBefore ?? null,
      },
      results.length,
      { source, fallbackReason, quotaUnits },
    );

    const saturation = computeSaturation(results);
    const quota = await getTodayQuotaUsage();

    return NextResponse.json({
      query: q,
      count: results.length,
      source,
      fallbackReason,
      cacheHit,
      quotaUnits,
      quota,
      fetchedAt,
      results,
      saturation,
    });
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null && "message" in err
          ? String(err.message)
          : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
