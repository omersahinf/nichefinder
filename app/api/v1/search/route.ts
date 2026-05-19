import { NextRequest, NextResponse } from "next/server";
import { searchAndEnrich } from "@/lib/youtube";
import { computeSaturation } from "@/lib/saturation";
import {
  getTodayQuotaUsage,
  isQuotaGuardActive,
  logSearch,
  queueLowResultKeywordCandidate,
  recordApiUsage,
  searchCachedVideos,
} from "@/lib/cache";
import { validateApiKey } from "@/lib/api-keys";
import { parseSearchRequest } from "@/lib/search-api";
import { enforceQuota } from "@/lib/billing";
import type { SearchSource } from "@/lib/search-types";

function bearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ error: "Bearer token required" }, { status: 401 });
  }

  const key = await validateApiKey(token);
  if (!key) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const { q, days, forceRefresh, page, pageSize, apiFetchSize, filterParams } =
    parseSearchRequest(req.nextUrl.searchParams);

  const apiAccess = await enforceQuota(key.userId, "api_access");
  if (!apiAccess.allowed) {
    return NextResponse.json({ error: apiAccess.reason ?? "API access requires Pro" }, { status: 403 });
  }

  const searchQuota = await enforceQuota(key.userId, "search");
  if (!searchQuota.allowed) {
    return NextResponse.json({ error: searchQuota.reason ?? "Search quota exceeded" }, { status: 403 });
  }

  try {
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
        filterLog: { ...filterParams, channel: "api" },
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
        via: "api_key",
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
        via: "api_key",
        ...filterParams,
        publishedAfter: filterParams.publishedAfter ?? null,
        publishedBefore: filterParams.publishedBefore ?? null,
      },
      dbPage.totalCount,
      { userId: key.userId, source, fallbackReason, quotaUnits },
    );

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
      fetchedAt,
      results: dbPage.results,
      saturation: computeSaturation(dbPage.results),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
