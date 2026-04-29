"use client";

import Link from "next/link";
import { useState } from "react";

interface TitleGenerationResponse {
  generation?: {
    keyword: string;
    model: string;
    titles: string[];
    createdAt: string;
  };
  error?: string;
  plan?: "free" | "pro";
  usedToday?: number;
  remainingToday?: number | null;
}

function shortDate(value?: string): string {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TitleGeneratorCard({
  keyword,
  slug,
}: {
  keyword: string;
  slug: string;
}) {
  const [titles, setTitles] = useState<string[]>([]);
  const [model, setModel] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const nextPath = `/niche/${encodeURIComponent(slug)}?q=${encodeURIComponent(keyword)}`;

  const generate = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setStatusCode(null);

    try {
      const res = await fetch("/api/ai/title-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const data = (await res.json().catch(() => ({}))) as TitleGenerationResponse;

      setStatusCode(res.status);
      if (!res.ok || !data.generation) {
        throw new Error(data.error ?? "Unable to generate titles");
      }

      setTitles(data.generation.titles);
      setModel(data.generation.model);
      setGeneratedAt(data.generation.createdAt);
      setPlan(data.plan ?? null);
      setRemainingToday(data.remainingToday ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate titles");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 lg:col-span-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Title Generator</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Generates 10 title ideas from the top 50 outlier title patterns in this niche.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {plan && (
            <span className="rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-xs text-neutral-300">
              {plan === "pro" ? "Pro" : "Free"}
            </span>
          )}
          {typeof remainingToday === "number" && (
            <span className="rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-xs text-neutral-400">
              {remainingToday} left today
            </span>
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate titles"}
          </button>
        </div>
      </div>

      {error ? (
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
      ) : titles.length > 0 ? (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {titles.map((title, index) => (
              <div
                key={`${index}-${title}`}
                className="rounded border border-neutral-800 bg-neutral-950/50 p-3"
              >
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Title {index + 1}
                </div>
                <div className="mt-2 text-sm leading-6 text-neutral-100">{title}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-400">
            <span>Generated: {shortDate(generatedAt ?? undefined)}</span>
            {model && <span>Model: {model}</span>}
          </div>
        </>
      ) : (
        <div className="mt-5 rounded-lg border border-dashed border-neutral-800 p-4 text-sm text-neutral-400">
          Free accounts get 3 generations per day. Pro is unlimited.
        </div>
      )}
    </section>
  );
}
