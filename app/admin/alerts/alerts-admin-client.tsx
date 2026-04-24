"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserAlert } from "@/lib/alerts";

type ApiAlertsResponse = {
  alerts?: UserAlert[];
  error?: string;
};

const fmtDate = (value?: string): string => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function AlertsAdminClient() {
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [keyword, setKeyword] = useState("ai tools");
  const [email, setEmail] = useState("");
  const [minOutlier, setMinOutlier] = useState(3);
  const [minSubs, setMinSubs] = useState(0);
  const [maxSubs, setMaxSubs] = useState(10_000_000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async (): Promise<UserAlert[]> => {
    const res = await fetch("/api/alerts");
    const data = (await res.json()) as ApiAlertsResponse;
    if (!res.ok) throw new Error(data.error ?? "Unable to load alerts");
    return data.alerts ?? [];
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchAlerts()
      .then((nextAlerts) => {
        if (!cancelled) setAlerts(nextAlerts);
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
  }, [fetchAlerts]);

  const create = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword, email, minOutlier, minSubs, maxSubs }),
      });
      const data = (await res.json()) as ApiAlertsResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to create alert");
      setAlerts(data.alerts ?? []);
      setKeyword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string): Promise<void> => {
    setError(null);
    const res = await fetch(`/api/alerts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as ApiAlertsResponse;
    if (!res.ok) {
      setError(data.error ?? "Unable to delete alert");
      return;
    }
    setAlerts(data.alerts ?? []);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-8">
          <div className="text-sm text-neutral-500">Admin</div>
          <h1 className="text-3xl font-bold tracking-tight">Alerts</h1>
        </header>

        <form
          onSubmit={create}
          className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 md:grid-cols-[1fr_1fr_120px_120px_120px_auto]"
        >
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="keyword"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email"
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <input
            type="number"
            min={0}
            step={0.5}
            value={minOutlier}
            onChange={(event) => setMinOutlier(Number(event.target.value) || 0)}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <input
            type="number"
            min={0}
            value={minSubs}
            onChange={(event) => setMinSubs(Number(event.target.value) || 0)}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <input
            type="number"
            min={0}
            value={maxSubs}
            onChange={(event) => setMaxSubs(Number(event.target.value) || 0)}
            className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Create"}
          </button>
        </form>

        {error && (
          <div className="mb-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-neutral-900 text-left text-xs uppercase tracking-wider text-neutral-400">
              <tr>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3 text-right">Min outlier</th>
                <th className="px-4 py-3 text-right">Subs</th>
                <th className="px-4 py-3">Last notified</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {loading && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={6}>
                    Loading...
                  </td>
                </tr>
              )}
              {!loading && alerts.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-neutral-500" colSpan={6}>
                    No alerts.
                  </td>
                </tr>
              )}
              {alerts.map((alert) => (
                <tr key={alert.id} className="hover:bg-neutral-900/50">
                  <td className="px-4 py-3 font-medium">{alert.keyword}</td>
                  <td className="px-4 py-3 text-neutral-300">{alert.email}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {alert.minOutlier.toFixed(1)}x
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {alert.minSubs} - {alert.maxSubs}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {fmtDate(alert.lastNotifiedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void remove(alert.id)}
                      className="rounded bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700"
                    >
                      Delete
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
