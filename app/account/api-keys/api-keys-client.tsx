"use client";

import { useEffect, useState } from "react";
import type { ApiKeyRecord } from "@/lib/api-keys";

interface ApiKeysResponse {
  keys?: ApiKeyRecord[];
  apiKey?: string;
  error?: string;
}

const shortDate = (value?: string): string =>
  value
    ? new Date(value).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "-";

export default function ApiKeysClient() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/api-keys")
      .then((res) => res.json().then((data: ApiKeysResponse) => ({ res, data })))
      .then(({ res, data }) => {
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Unable to load API keys");
        setKeys(data.keys ?? []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load API keys");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const createKey = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!label.trim()) return;

    setSaving(true);
    setError(null);
    setNewKey(null);

    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = (await res.json()) as ApiKeysResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to create API key");
      setKeys(data.keys ?? []);
      setNewKey(data.apiKey ?? null);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create API key");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string): Promise<void> => {
    setError(null);

    try {
      const res = await fetch(`/api/api-keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as ApiKeysResponse;
      if (!res.ok) throw new Error(data.error ?? "Unable to revoke API key");
      setKeys(data.keys ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke API key");
    }
  };

  return (
    <>
      <form onSubmit={createKey} className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Production, local script, analytics sync"
          className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none focus:border-red-500"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create API key"}
        </button>
      </form>

      {newKey && (
        <div className="mb-6 rounded-lg border border-amber-900 bg-amber-950/30 p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-300">
            Copy now
          </div>
          <div className="mt-2 break-all font-mono text-sm text-amber-100">{newKey}</div>
          <p className="mt-2 text-xs text-amber-200/80">
            This is the only time the full key is shown.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-neutral-500">Loading...</div>
      ) : keys.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-8 text-sm text-neutral-500">
          No API keys yet.
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((key) => (
            <div key={key.id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-neutral-100">{key.label}</div>
                  <div className="mt-1 font-mono text-xs text-neutral-500">{key.keyPrefix}...</div>
                </div>
                <button
                  type="button"
                  onClick={() => void revoke(key.id)}
                  disabled={Boolean(key.revokedAt)}
                  className="w-fit rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-semibold text-neutral-200 hover:border-red-500 disabled:opacity-50"
                >
                  {key.revokedAt ? "Revoked" : "Revoke"}
                </button>
              </div>
              <div className="mt-3 grid gap-3 text-xs text-neutral-400 sm:grid-cols-3">
                <div>Created: {shortDate(key.createdAt)}</div>
                <div>Last used: {shortDate(key.lastUsedAt)}</div>
                <div>Status: {key.revokedAt ? "revoked" : "active"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
