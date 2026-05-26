import { NextRequest, NextResponse } from "next/server";
import { searchAndEnrich } from "@/lib/youtube";
import { computeSaturation } from "@/lib/saturation";
import { computeNicheDecision } from "@/lib/niche-decision";
import {
  getTodayQuotaUsage,
  isQuotaGuardActive,
  logSearch,
  queueLowResultKeywordCandidate,
  recordApiUsage,
  searchCachedVideos,
} from "@/lib/cache";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { enforceQuota } from "@/lib/billing";
import { parseSearchRequest } from "@/lib/search-api";
import type { SearchSource } from "@/lib/search-types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { q, days, forceRefresh, page, pageSize, apiFetchSize, filterParams } =
    parseSearchRequest(req.nextUrl.searchParams);

  try {
    const identity = await getCurrentAuthIdentity();

    const quotaCheck = await enforceQuota(identity?.id, "search");
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        { error: quotaCheck.reason ?? "Search quota exceeded", plan: quotaCheck.plan },
        { status: 403 },
      );
    }

    let source: SearchSource = "database";
    let fallbackReason: string | undefined;
    let refreshReason: string | undefined;
    let fetchedAt: string | undefined;
    let quotaUnits = 0;

    if (forceRefresh && q) {
      const quotaBefore = await getTodayQuotaUsage();
      const refreshResult = await searchAndEnrich(q, apiFetchSize, {
        publishedAfter: filterParams.publishedAfter,
        publishedBefore: filterParams.publishedBefore,
        days,
        filterLog: filterParams,
        forceMock: isQuotaGuardActive(quotaBefore),
        forceRefresh: true,
      });

      source =
        refreshResult.source === "youtube_refresh" ? "database_youtube_refresh" : "database";
      fallbackReason = refreshResult.fallbackReason;
      refreshReason = refreshResult.fallbackReason;
      fetchedAt = refreshResult.fetchedAt;
      quotaUnits = refreshResult.quotaUnits ?? 0;

      await recordApiUsage(quotaUnits, {
        query: q,
        apiFetchSize,
        days,
        source: refreshResult.source,
        ...filterParams,
      });
    } else if (forceRefresh && !q) {
      refreshReason = "Keyword is required for YouTube refresh";
    }

    const dbPage = await searchCachedVideos({
      q,
      ...filterParams,
      page,
      pageSize,
    });

    if (q && !forceRefresh) {
      await queueLowResultKeywordCandidate(q, dbPage.totalCount);
    }

    await logSearch(
      q ?? "",
      {
        page,
        pageSize,
        apiFetchSize,
        days,
        forceRefresh,
        ...filterParams,
        publishedAfter: filterParams.publishedAfter ?? null,
        publishedBefore: filterParams.publishedBefore ?? null,
      },
      dbPage.totalCount,
      { userId: identity?.id, source, fallbackReason, quotaUnits },
    );

    const saturation = computeSaturation(dbPage.results);
    const decision = computeNicheDecision(saturation);
    const quota = await getTodayQuotaUsage();

    return NextResponse.json({
      query: q ?? "",
      count: dbPage.results.length,
      totalCount: dbPage.totalCount,
      page: dbPage.page,
      pageSize: dbPage.pageSize,
      hasMore: dbPage.hasMore,
      source,
      fallbackReason,
      refreshReason,
      dbMatchCount: dbPage.totalCount,
      cacheHit: true,
      browseMode: !q,
      quotaUnits,
      quota,
      fetchedAt,
      results: dbPage.results,
      saturation,
      decision,
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
