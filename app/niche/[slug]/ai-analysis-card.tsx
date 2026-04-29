"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { NicheInsight } from "@/lib/ai/niche-insights";

interface NicheAiInsightsResponse {
  insight?: NicheInsight;
  error?: string;
  plan?: "free" | "pro";
  loginRequired?: boolean;
}

function shortDate(value?: string): string {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AiAnalysisCard({
  keyword,
  slug,
}: {
  keyword: string;
  slug: string;
}) {
  const [insight, setInsight] = useState<NicheInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const nextPath = `/niche/${encodeURIComponent(slug)}?q=${encodeURIComponent(keyword)}`;

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/ai/niche-insights?q=${encodeURIComponent(keyword)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as NicheAiInsightsResponse;
        if (cancelled) return;

        setStatusCode(res.status);
        if (!res.ok) throw new Error(data.error ?? "Unable to load AI analysis");
        setInsight(data.insight ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load AI analysis");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [keyword]);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">AI Analysis</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Five-sentence niche read based on cached outliers, saturation, categories, and trend
            signals.
          </p>
        </div>

        {insight && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-neutral-300">
              {insight.cached ? "Cached" : "Fresh"}
            </span>
            {insight.stale && (
              <span className="rounded border border-amber-800 bg-amber-950/40 px-2 py-1 text-amber-200">
                Stale
              </span>
            )}
            <span className="rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-neutral-400">
              {insight.model}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-5 space-y-3">
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              className="h-4 animate-pulse rounded bg-neutral-800/80"
              style={{ width: `${92 - index * 9}%` }}
            />
          ))}
        </div>
      ) : error ? (
        <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 text-sm text-neutral-300">
          <div>{error}</div>
          {(statusCode === 401 || statusCode === 403) && (
            <div className="mt-4 flex flex-wrap gap-3">
              {statusCode === 401 ? (
                <Link
                  href={`/login?next=${encodeURIComponent(nextPath)}`}
                  className="rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                >
                  Log in
                </Link>
              ) : (
                <Link
                  href="/pricing"
                  className="rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500"
                >
                  Upgrade to Pro
                </Link>
              )}
            </div>
          )}
        </div>
      ) : insight ? (
        <>
          <div className="mt-5 space-y-3">
            {insight.analysis.map((sentence, index) => (
              <p key={index} className="text-sm leading-6 text-neutral-200">
                {sentence}
              </p>
            ))}
          </div>

          <div className="mt-6 grid gap-3 text-xs text-neutral-400 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="uppercase tracking-wider text-neutral-500">Videos used</div>
              <div className="mt-1 font-mono text-neutral-100">{insight.sampleSize}</div>
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="uppercase tracking-wider text-neutral-500">Generated</div>
              <div className="mt-1 text-neutral-200">{shortDate(insight.generatedAt)}</div>
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="uppercase tracking-wider text-neutral-500">Expires</div>
              <div className="mt-1 text-neutral-200">{shortDate(insight.expiresAt)}</div>
            </div>
            <div className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="uppercase tracking-wider text-neutral-500">Top categories</div>
              <div className="mt-1 text-neutral-200">{insight.topCategories.join(", ") || "-"}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-neutral-800 p-4 text-sm text-neutral-400">
          AI analysis is not available yet for this niche.
        </div>
      )}
    </section>
  );
}
