import { NextRequest, NextResponse } from "next/server";
import { searchAndEnrich } from "@/lib/youtube";
import { computeSaturation } from "@/lib/saturation";
import { getTodayQuotaUsage, isQuotaGuardActive, logSearch, recordApiUsage } from "@/lib/cache";
import { validateApiKey } from "@/lib/api-keys";
import { applySearchFilters, parseSearchRequest } from "@/lib/search-api";
import { enforceQuota } from "@/lib/billing";

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

  const { q, maxResults, days, forceRefresh, filterParams } = parseSearchRequest(
    req.nextUrl.searchParams,
  );

  if (!q) {
    return NextResponse.json({ error: "Query parameter q is required" }, { status: 400 });
  }

  const apiAccess = await enforceQuota(key.userId, "api_access");
  if (!apiAccess.allowed) {
    return NextResponse.json({ error: apiAccess.reason ?? "API access requires Pro" }, { status: 403 });
  }

  const searchQuota = await enforceQuota(key.userId, "search");
  if (!searchQuota.allowed) {
    return NextResponse.json({ error: searchQuota.reason ?? "Search quota exceeded" }, { status: 403 });
  }

  try {
    const quotaBefore = await getTodayQuotaUsage();
    const { results: rawResults, source, fallbackReason, cacheHit, quotaUnits = 0, fetchedAt } =
      await searchAndEnrich(q, maxResults, {
        publishedAfter: filterParams.publishedAfter,
        publishedBefore: filterParams.publishedBefore,
        days,
        filterLog: { ...filterParams, channel: "api" },
        forceMock: isQuotaGuardActive(quotaBefore),
        forceRefresh,
      });
    const results = applySearchFilters(rawResults, filterParams);

    await recordApiUsage(quotaUnits, {
      query: q,
      maxResults,
      days,
      source,
      via: "api_key",
      ...filterParams,
    });
    await logSearch(
      q,
      {
        maxResults,
        days,
        forceRefresh,
        via: "api_key",
        ...filterParams,
        publishedAfter: filterParams.publishedAfter ?? null,
        publishedBefore: filterParams.publishedBefore ?? null,
      },
      results.length,
      { userId: key.userId, source, fallbackReason, quotaUnits },
    );

    return NextResponse.json({
      query: q,
      count: results.length,
      source,
      fallbackReason,
      cacheHit,
      quotaUnits,
      fetchedAt,
      results,
      saturation: computeSaturation(results),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
