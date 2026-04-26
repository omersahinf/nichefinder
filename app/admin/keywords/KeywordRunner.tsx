"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface KeywordRow {
  id: string;
  keyword: string;
  category: string | null;
  priority: number;
  enabled: boolean;
  source: string;
  parent_keyword_id: string | null;
  expires_at: string | null;
  last_searched_at: string | null;
  total_runs: number;
  total_channels_added: number;
  unique_channels_added: number;
  created_at: string;
}

interface KeywordListResponse {
  keywords?: KeywordRow[];
  total?: number;
  summary?: KeywordSummary;
  error?: string;
}

interface KeywordSummary {
  total: number;
  enabled: number;
  disabled: number;
  untested: number;
  averageYield: number;
  sourceCounts: Record<string, number>;
  bestSource: {
    source: string;
    yield: number;
  } | null;
}

interface MutationResponse {
  keyword?: KeywordRow;
  error?: string;
}

interface RunnerResponse {
  keywordsProcessed?: number;
  channelsDiscovered?: number;
  unitsUsed?: number;
  stoppedReason?: string;
  results?: Record<
    string,
    { candidatesFound?: number; candidatesAdded?: number; error?: string }
  >;
  candidatesFound?: number;
  candidatesAdded?: number;
  metadata?: Record<string, unknown>;
  error?: string;
}

type EnabledFilter = "" | "true" | "false";

interface PatternListResponse {
  patterns?: Array<{
    pattern: string;
    pattern_type: string;
    score: number;
    velocity_score: number;
    video_count: number;
    channel_count: number;
    slot_count: number;
  }>;
  today_ai_cost_usd?: number;
  today_ai_shadow_cost_usd?: number;
  error?: string;
}

const fmtDate = (value: string | null): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatResult = (data: RunnerResponse): string => {
  if (data.error) return data.error;
  if (data.keywordsProcessed !== undefined) {
    return `${data.keywordsProcessed} keywords, ${data.channelsDiscovered ?? 0} channels, ${
      data.unitsUsed ?? 0
    } units, ${data.stoppedReason ?? "completed"}`;
  }
  if (data.results) {
    return Object.entries(data.results)
      .map(
        ([job, result]) =>
          result.error
            ? `${job}: ${result.error}`
            : `${job}: ${result.candidatesAdded ?? 0}/${result.candidatesFound ?? 0}`,
      )
      .join(" | ");
  }
  return `${data.candidatesAdded ?? 0}/${data.candidatesFound ?? 0} added`;
};

const fmtUsd = (value: number): string => `$${value.toFixed(4)}`;

const sourceClass = (source: string): string => {
  if (source === "manual") return "border-blue-900 bg-blue-950/60 text-blue-100";
  if (source === "trend") return "border-amber-900 bg-amber-950/60 text-amber-100";
  if (source === "ai_generated") return "border-fuchsia-900 bg-fuchsia-950/60 text-fuchsia-100";
  if (source === "ai_vertical") return "border-fuchsia-900 bg-fuchsia-950/60 text-fuchsia-100";
  if (source === "ai_slot") return "border-violet-900 bg-violet-950/60 text-violet-100";
  if (source === "pattern_probe") return "border-cyan-900 bg-cyan-950/60 text-cyan-100";
  if (source === "variation") return "border-emerald-900 bg-emerald-950/60 text-emerald-100";
  return "border-neutral-700 bg-neutral-900 text-neutral-200";
};

export default function KeywordRunner({
  initialKeywords,
  initialTotal,
}: {
  initialKeywords: KeywordRow[];
  initialTotal: number;
}) {
  const [keywords, setKeywords] = useState(initialKeywords);
  const [total, setTotal] = useState(initialTotal);
  const [summary, setSummary] = useState<KeywordSummary | null>(null);
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState(50);
  const [maxKeywords, setMaxKeywords] = useState(88);
  const [source, setSource] = useState("");
  const [enabled, setEnabled] = useState<EnabledFilter>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [todayAiCostUsd, setTodayAiCostUsd] = useState(0);
  const [todayAiShadowCostUsd, setTodayAiShadowCostUsd] = useState(0);

  const categories = useMemo(
    () =>
      [...new Set(keywords.flatMap((row) => (row.category ? [row.category] : [])))].sort(),
    [keywords],
  );

  const refreshKeywords = useCallback(
    async (nextSource = source, nextEnabled = enabled, nextCategory = ""): Promise<void> => {
      const params = new URLSearchParams({ pageSize: "100" });
      if (nextSource) params.set("source", nextSource);
      if (nextEnabled) params.set("enabled", nextEnabled);
      if (nextCategory) params.set("category", nextCategory);

      const response = await fetch(`/api/admin/keywords?${params}`);
      const data = (await response.json()) as KeywordListResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to load keywords");
      setKeywords(data.keywords ?? []);
      setTotal(data.total ?? 0);
      setSummary(data.summary ?? null);
    },
    [enabled, source],
  );

  const fetchGrowthStatus = useCallback(async (): Promise<PatternListResponse> => {
    const response = await fetch("/api/admin/grow");
    const data = (await response.json()) as PatternListResponse;
    if (!response.ok) throw new Error(data.error ?? "Unable to load growth status");
    return data;
  }, []);

  const refreshGrowthStatus = useCallback(async (): Promise<PatternListResponse> => {
    const data = await fetchGrowthStatus();
    setTodayAiCostUsd(Number(data.today_ai_cost_usd ?? 0));
    setTodayAiShadowCostUsd(Number(data.today_ai_shadow_cost_usd ?? 0));
    return data;
  }, [fetchGrowthStatus]);

  useEffect(() => {
    let cancelled = false;

    fetchGrowthStatus()
      .then((data) => {
        if (cancelled) return;
        setTodayAiCostUsd(Number(data.today_ai_cost_usd ?? 0));
        setTodayAiShadowCostUsd(Number(data.today_ai_shadow_cost_usd ?? 0));
      })
      .catch(() => {
        if (!cancelled) {
          setTodayAiCostUsd(0);
          setTodayAiShadowCostUsd(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fetchGrowthStatus]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ pageSize: "100" });

    fetch(`/api/admin/keywords?${params}`)
      .then(async (response) => {
        const data = (await response.json()) as KeywordListResponse;
        if (!response.ok) throw new Error(data.error ?? "Unable to load keywords");
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setKeywords(data.keywords ?? []);
        setTotal(data.total ?? 0);
        setSummary(data.summary ?? null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const runJob = async (
    label: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<void> => {
    setBusy(label);
    setError(null);
    setStatus(`${label} running...`);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = (await response.json()) as RunnerResponse;
      if (!response.ok) throw new Error(data.error ?? `${label} failed`);
      setStatus(`${label}: ${formatResult(data)}`);
      await refreshKeywords();
      await refreshGrowthStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setStatus(null);
    } finally {
      setBusy(null);
    }
  };

  const viewPatterns = async (): Promise<void> => {
    setBusy("patterns");
    setError(null);
    try {
      const data = await refreshGrowthStatus();
      const summary = (data.patterns ?? [])
        .slice(0, 8)
        .map(
          (pattern) =>
            `${pattern.pattern} (${pattern.video_count} videos, ${pattern.channel_count} channels)`,
        )
        .join(" | ");
      setStatus(summary || "No title patterns found yet.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load patterns");
    } finally {
      setBusy(null);
    }
  };

  const addKeyword = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy("add");
    setError(null);

    try {
      const response = await fetch("/api/admin/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, category, priority }),
      });
      const data = (await response.json()) as MutationResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to add keyword");
      setKeyword("");
      await refreshKeywords();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add keyword");
    } finally {
      setBusy(null);
    }
  };

  const patchKeyword = async (
    id: string,
    updates: { enabled?: boolean; priority?: number; category?: string | null },
  ): Promise<void> => {
    setError(null);
    const previous = keywords;
    setKeywords((current) =>
      current.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );

    const response = await fetch("/api/admin/keywords", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    const data = (await response.json()) as MutationResponse;
    if (!response.ok || !data.keyword) {
      setKeywords(previous);
      setError(data.error ?? "Unable to update keyword");
      return;
    }
    setKeywords((current) => current.map((row) => (row.id === id ? data.keyword! : row)));
  };

  const deleteKeyword = async (id: string): Promise<void> => {
    setError(null);
    const response = await fetch(`/api/admin/keywords?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Unable to delete keyword");
      return;
    }
    setKeywords((current) => current.filter((row) => row.id !== id));
    setTotal((current) => Math.max(0, current - 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-neutral-400">Growth orchestrator</div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300">
            AI cost today: {fmtUsd(todayAiCostUsd)}
          </span>
          <span className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1 text-neutral-300">
            shadow: {fmtUsd(todayAiShadowCostUsd)}
          </span>
        </div>
      </div>

      <section className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 lg:grid-cols-[1fr_auto]">
        <form onSubmit={addKeyword} className="grid gap-3 md:grid-cols-[1fr_160px_110px_auto]">
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="Keyword"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <input
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Category"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <input
            type="number"
            min={0}
            max={100}
            value={priority}
            onChange={(event) => setPriority(Number(event.target.value) || 0)}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap">
          <input
            type="number"
            min={1}
            max={100}
            value={maxKeywords}
            onChange={(event) => setMaxKeywords(Number(event.target.value) || 1)}
            className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runJob("Auto-search", "/api/admin/auto-search", { maxKeywords })
            }
            className="rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-950 hover:bg-white disabled:opacity-50"
          >
            Run auto-search now
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runJob("Discovery", "/api/admin/keyword-discovery")}
            className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
          >
            Run discovery
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() =>
              void runJob("AI generator", "/api/admin/keyword-discovery", { jobs: ["ai"] })
            }
            className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
          >
            Run AI generator
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void runJob("Growth", "/api/admin/grow", { mode: "discover" })}
            className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
          >
            Run growth
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void viewPatterns()}
            className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50"
          >
            View patterns
          </button>
        </div>
      </section>

      {(status || error) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-900 bg-red-950/40 text-red-100"
              : "border-emerald-900 bg-emerald-950/40 text-emerald-100"
          }`}
        >
          {error ?? status}
        </div>
      )}

      {summary && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Enabled</div>
            <div className="mt-1 font-mono text-lg text-neutral-100">
              {summary.enabled}/{summary.total}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Untested</div>
            <div className="mt-1 font-mono text-lg text-neutral-100">{summary.untested}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Avg yield</div>
            <div className="mt-1 font-mono text-lg text-neutral-100">
              {summary.averageYield.toFixed(1)}
            </div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Best source</div>
            <div className="mt-1 truncate text-sm text-neutral-100">
              {summary.bestSource
                ? `${summary.bestSource.source} (${summary.bestSource.yield.toFixed(1)})`
                : "-"}
            </div>
          </div>
        </section>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-neutral-400">{total} keywords</div>
        <div className="flex flex-wrap gap-2">
          <select
            value={source}
            onChange={(event) => {
              const value = event.target.value;
              setSource(value);
              void refreshKeywords(value, enabled);
            }}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none"
          >
            <option value="">All sources</option>
            <option value="manual">Manual</option>
            <option value="extracted">Extracted</option>
            <option value="variation">Variation</option>
            <option value="trend">Trend</option>
            <option value="ai_generated">AI generated</option>
            <option value="ai_vertical">AI vertical</option>
            <option value="ai_slot">AI slot</option>
            <option value="pattern_probe">Pattern probe</option>
          </select>
          <select
            value={enabled}
            onChange={(event) => {
              const value = event.target.value as EnabledFilter;
              setEnabled(value);
              void refreshKeywords(source, value);
            }}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none"
          >
            <option value="">Any state</option>
            <option value="true">Enabled</option>
            <option value="false">Disabled</option>
          </select>
          {categories.length > 0 && (
            <select
              onChange={(event) => void refreshKeywords(source, enabled, event.target.value)}
              className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none"
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          )}
        </div>
      </section>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-400">
            <tr>
              <th className="px-4 py-3">Keyword</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3 text-right">Priority</th>
              <th className="px-4 py-3 text-right">Runs</th>
              <th className="px-4 py-3 text-right">Channels</th>
              <th className="px-4 py-3 text-right">Yield</th>
              <th className="px-4 py-3">Last searched</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Enabled</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {keywords.length === 0 && (
              <tr>
                <td className="px-4 py-8 text-center text-neutral-500" colSpan={11}>
                  No keywords.
                </td>
              </tr>
            )}
            {keywords.map((row) => {
              const runs = Number(row.total_runs ?? 0);
              const channels = Number(row.total_channels_added ?? 0);
              const yieldValue = channels / Math.max(runs, 1);

              return (
                <tr key={row.id} className="hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-medium">{row.keyword}</td>
                  <td className="px-4 py-3">
                    <input
                      value={row.category ?? ""}
                      onChange={(event) =>
                        setKeywords((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? { ...item, category: event.target.value || null }
                              : item,
                          ),
                        )
                      }
                      onBlur={(event) =>
                        void patchKeyword(row.id, {
                          category: event.target.value.trim() || null,
                        })
                      }
                      className="w-32 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs outline-none focus:border-red-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded border px-2 py-1 text-xs font-medium ${sourceClass(
                        row.source,
                      )}`}
                    >
                      {row.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={row.priority}
                      onChange={(event) =>
                        setKeywords((current) =>
                          current.map((item) =>
                            item.id === row.id
                              ? { ...item, priority: Number(event.target.value) || 0 }
                              : item,
                          ),
                        )
                      }
                      onBlur={(event) =>
                        void patchKeyword(row.id, {
                          priority: Number(event.target.value) || 0,
                        })
                      }
                      className="w-20 rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-right font-mono text-xs outline-none focus:border-red-500"
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{runs}</td>
                  <td className="px-4 py-3 text-right font-mono">{channels}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {yieldValue.toFixed(1)}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {fmtDate(row.last_searched_at)}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{fmtDate(row.expires_at)}</td>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(event) =>
                        void patchKeyword(row.id, { enabled: event.target.checked })
                      }
                      className="h-4 w-4 accent-red-600"
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteKeyword(row.id)}
                      className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
