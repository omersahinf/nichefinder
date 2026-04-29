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
import { getCurrentAuthIdentity } from "@/lib/auth";
import { enforceQuota } from "@/lib/billing";
import { applySearchFilters, parseSearchRequest } from "@/lib/search-api";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { q, maxResults, days, forceRefresh, filterParams } = parseSearchRequest(
    req.nextUrl.searchParams,
  );

  try {
    const identity = await getCurrentAuthIdentity();

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

    const quotaCheck = await enforceQuota(identity?.id, "search");
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { error: quotaCheck.reason ?? "Search quota exceeded", plan: quotaCheck.plan },
        { status: 403 },
      );
    }

    const quotaBefore = await getTodayQuotaUsage();
    const { results: rawResults, source, fallbackReason, cacheHit, quotaUnits = 0, fetchedAt } =
      await searchAndEnrich(q, maxResults, {
        publishedAfter: filterParams.publishedAfter,
        publishedBefore: filterParams.publishedBefore,
        days,
        filterLog: filterParams,
        forceMock: isQuotaGuardActive(quotaBefore),
        forceRefresh,
      });
    const results = applySearchFilters(rawResults, filterParams);

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
        publishedAfter: filterParams.publishedAfter ?? null,
        publishedBefore: filterParams.publishedBefore ?? null,
      },
      results.length,
      { userId: identity?.id, source, fallbackReason, quotaUnits },
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
