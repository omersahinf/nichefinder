"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SeedChannel } from "@/lib/cache";

const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
};

const shortDate = (value?: string): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

type ApiSeedsResponse = {
  seeds?: SeedChannel[];
  error?: string;
};

export default function SeedAdminClient() {
  const [seeds, setSeeds] = useState<SeedChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [priority, setPriority] = useState(50);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [crawling, setCrawling] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const uncrawled = seeds.filter((seed) => !seed.lastCrawledAt).length;
    const totalSubs = seeds.reduce((sum, seed) => sum + seed.subs, 0);
    return { uncrawled, totalSubs };
  }, [seeds]);

  const fetchSeeds = useCallback(async (): Promise<SeedChannel[]> => {
    const res = await fetch("/api/admin/seeds");
    const data = (await res.json()) as ApiSeedsResponse;
    if (!res.ok) throw new Error(data.error ?? "Unable to load seed list");
    return data.seeds ?? [];
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    setSeeds(await fetchSeeds());
  }, [fetchSeeds]);

  useEffect(() => {
    let cancelled = false;

    fetchSeeds()
      .then((nextSeeds) => {
        if (!cancelled) setSeeds(nextSeeds);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Error");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchSeeds]);

  const addSeed = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!channelId.trim()) return;

    setSaving(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, priority }),
      });
      const data = (await res.json()) as ApiSeedsResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to add seed");

      setSeeds(data.seeds ?? []);
      setChannelId("");
      setNotice("Seed added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const crawlSeeds = async (ids: string[], label: string): Promise<void> => {
    setCrawling(label);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/admin/seeds/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids.length > 0 ? { channelIds: ids } : {}),
      });
      const data = (await res.json()) as {
        requested?: number;
        refreshed?: number;
        quotaUnits?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Unable to start crawl");

      setNotice(
        `${data.refreshed ?? 0}/${data.requested ?? 0} channels refreshed, ${
          data.quotaUnits ?? 0
        } quota units.`,
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setCrawling(null);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm text-neutral-500">Admin</div>
            <h1 className="text-3xl font-bold tracking-tight">Seed Channels</h1>
            <p className="mt-2 text-sm text-neutral-400">
              Channels found in search results are added automatically. Add manual channels
              and manage refresh priority here.
            </p>
          </div>

          <button
            type="button"
            onClick={() => crawlSeeds([], "all")}
            disabled={loading || crawling !== null || seeds.length === 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50"
          >
            {crawling === "all" ? "Refreshing..." : "Refresh top 50 seeds"}
          </button>
        </header>

        <section className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="text-xs uppercase tracking-wider text-neutral-500">Seed</div>
            <div className="mt-1 font-mono text-2xl">{seeds.length}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Pending crawl
            </div>
            <div className="mt-1 font-mono text-2xl">{stats.uncrawled}</div>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Total subs
            </div>
            <div className="mt-1 font-mono text-2xl">{fmt(stats.totalSubs)}</div>
          </div>
        </section>

        <form
          onSubmit={addSeed}
          className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 md:grid-cols-[1fr_140px_auto]"
        >
          <input
            value={channelId}
            onChange={(event) => setChannelId(event.target.value)}
            placeholder="UC... channel ID or /channel/UC... URL"
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
            disabled={saving}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white disabled:opacity-50"
          >
            {saving ? "Adding..." : "Add manually"}
          </button>
        </form>

        {notice && (
          <div className="mb-6 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100">
            {notice}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="min-w-[960px] w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3 text-right">Subs</th>
                <th className="px-4 py-3 text-right">Video</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3 text-right">Priority</th>
                <th className="px-4 py-3">Last crawl</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {loading && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={7}>
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && seeds.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={7}>
                    No seed channels.
                  </td>
                </tr>
              )}

              {seeds.map((seed) => (
                <tr key={seed.channelId} className="hover:bg-neutral-900/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {seed.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={seed.thumbnail}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <a
                          href={`https://youtube.com/channel/${seed.channelId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-1 font-medium hover:text-red-400"
                        >
                          {seed.title}
                        </a>
                        <div className="font-mono text-xs text-neutral-500">
                          {seed.channelId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(seed.subs)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(seed.videoCount)}</td>
                  <td className="px-4 py-3 text-neutral-400">{seed.addedVia}</td>
                  <td className="px-4 py-3 text-right font-mono">{seed.priority}</td>
                  <td className="px-4 py-3 text-neutral-400">
                    {shortDate(seed.lastCrawledAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => crawlSeeds([seed.channelId], seed.channelId)}
                      disabled={crawling !== null}
                      className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
                    >
                      {crawling === seed.channelId ? "..." : "Refresh"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
