import { NextRequest, NextResponse } from "next/server";
import { searchAndEnrich } from "@/lib/youtube";
import { computeSaturation } from "@/lib/saturation";
import {
  getTodayQuotaUsage,
  isQuotaGuardActive,
  logSearch,
  recordApiUsage,
} from "@/lib/cache";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const requestedMax = Number(req.nextUrl.searchParams.get("max") ?? 25);
  const maxResults = Number.isFinite(requestedMax)
    ? Math.min(Math.max(requestedMax, 5), 50)
    : 25;
  const requestedDays = Number(req.nextUrl.searchParams.get("days") ?? 0);
  const days = Number.isFinite(requestedDays) && requestedDays > 0 ? requestedDays : 0;
  const forceRefresh = req.nextUrl.searchParams.get("force") === "1";

  if (!q) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const publishedAfter =
    days > 0
      ? new Date(Date.now() - days * 86400000).toISOString()
      : undefined;

  try {
    const quotaBefore = await getTodayQuotaUsage();
    const { results, source, fallbackReason, cacheHit, quotaUnits = 0, fetchedAt } =
      await searchAndEnrich(q, maxResults, {
        publishedAfter,
        days,
        forceMock: isQuotaGuardActive(quotaBefore),
        forceRefresh,
      });

    await recordApiUsage(quotaUnits, {
      query: q,
      maxResults,
      days,
      source,
    });
    await logSearch(
      q,
      { maxResults, days, publishedAfter: publishedAfter ?? null, forceRefresh },
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
    const msg = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
