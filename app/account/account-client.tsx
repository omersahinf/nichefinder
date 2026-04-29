"use client";

import { useState } from "react";

export default function AccountClient({ canManageBilling }: { canManageBilling: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openPortal = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Unable to open billing portal");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open billing portal");
      setLoading(false);
    }
  };

  if (!canManageBilling) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => void openPortal()}
        disabled={loading}
        className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm font-semibold text-neutral-100 hover:border-red-500 disabled:opacity-50"
      >
        {loading ? "Opening..." : "Manage billing"}
      </button>

      {error && (
        <div className="mt-4 rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
