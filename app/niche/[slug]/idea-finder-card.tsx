"use client";

import Link from "next/link";
import { useState } from "react";

interface IdeaGenerationResponse {
  generation?: {
    keyword: string;
    model: string;
    ideas: Array<{ title: string; hook: string }>;
    createdAt: string;
  };
  error?: string;
  plan?: "free" | "pro";
}

function shortDate(value?: string): string {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function IdeaFinderCard({
  keyword,
  slug,
}: {
  keyword: string;
  slug: string;
}) {
  const [ideas, setIdeas] = useState<Array<{ title: string; hook: string }>>([]);
  const [model, setModel] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [plan, setPlan] = useState<"free" | "pro" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const nextPath = `/niche/${encodeURIComponent(slug)}?q=${encodeURIComponent(keyword)}`;

  const generate = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setStatusCode(null);

    try {
      const res = await fetch("/api/ai/idea-finder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword }),
      });
      const data = (await res.json().catch(() => ({}))) as IdeaGenerationResponse;

      setStatusCode(res.status);
      if (!res.ok || !data.generation) {
        throw new Error(data.error ?? "Unable to generate ideas");
      }

      setIdeas(data.generation.ideas);
      setModel(data.generation.model);
      setGeneratedAt(data.generation.createdAt);
      setPlan(data.plan ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to generate ideas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 lg:col-span-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Idea Finder</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Suggests 10 video ideas with hooks based on the strongest outlier patterns in this niche.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {plan && (
            <span className="rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-xs text-neutral-300">
              {plan === "pro" ? "Pro" : "Free"}
            </span>
          )}
          <button
            type="button"
            onClick={() => void generate()}
            disabled={loading}
            className="rounded bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {loading ? "Generating..." : "Suggest ideas"}
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
      ) : ideas.length > 0 ? (
        <>
          <div className="mt-5 space-y-3">
            {ideas.map((idea, index) => (
              <div
                key={`${index}-${idea.title}`}
                className="rounded border border-neutral-800 bg-neutral-950/50 p-4"
              >
                <div className="text-xs uppercase tracking-wider text-neutral-500">
                  Idea {index + 1}
                </div>
                <div className="mt-2 text-sm font-semibold text-neutral-100">{idea.title}</div>
                <div className="mt-2 text-sm leading-6 text-neutral-300">{idea.hook}</div>
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
          Pro feature. Generates 10 usable topic-angle pairs for this niche.
        </div>
      )}
    </section>
  );
}
