"use client";

import { useState } from "react";

export default function PricingClient() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startCheckout = async (plan: "pro_monthly" | "pro_yearly"): Promise<void> => {
    setLoadingPlan(plan);
    setError(null);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Unable to start checkout");
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start checkout");
      setLoadingPlan(null);
    }
  };

  return (
    <>
      {error && (
        <div className="mb-6 rounded border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="text-sm font-semibold text-neutral-400">Free</div>
          <div className="mt-3 text-3xl font-bold">$0</div>
          <div className="mt-1 text-sm text-neutral-500">For lightweight discovery</div>
          <ul className="mt-6 space-y-2 text-sm text-neutral-300">
            <li>10 searches / day</li>
            <li>5 saved searches</li>
            <li>No alerts</li>
            <li>No CSV export</li>
            <li>No AI analysis</li>
            <li>3 AI title generations / day</li>
            <li>No AI idea finder</li>
          </ul>
        </section>

        <section className="rounded-lg border border-red-800 bg-red-950/20 p-6">
          <div className="text-sm font-semibold text-red-300">Pro Monthly</div>
          <div className="mt-3 text-3xl font-bold">$9</div>
          <div className="mt-1 text-sm text-neutral-400">per month</div>
          <ul className="mt-6 space-y-2 text-sm text-neutral-200">
            <li>Unlimited searches</li>
            <li>Unlimited saved searches</li>
            <li>10 alerts</li>
            <li>CSV export</li>
            <li>AI niche analysis</li>
            <li>Unlimited AI title generation</li>
            <li>AI idea finder</li>
          </ul>
          <button
            type="button"
            onClick={() => void startCheckout("pro_monthly")}
            disabled={loadingPlan !== null}
            className="mt-6 w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
          >
            {loadingPlan === "pro_monthly" ? "Redirecting..." : "Choose monthly"}
          </button>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="text-sm font-semibold text-neutral-300">Pro Yearly</div>
          <div className="mt-3 text-3xl font-bold">$79</div>
          <div className="mt-1 text-sm text-emerald-300">About 30% off</div>
          <ul className="mt-6 space-y-2 text-sm text-neutral-300">
            <li>Unlimited searches</li>
            <li>Unlimited saved searches</li>
            <li>10 alerts</li>
            <li>CSV export</li>
            <li>AI niche analysis</li>
            <li>Unlimited AI title generation</li>
            <li>AI idea finder</li>
          </ul>
          <button
            type="button"
            onClick={() => void startCheckout("pro_yearly")}
            disabled={loadingPlan !== null}
            className="mt-6 w-full rounded-lg border border-neutral-700 bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-white disabled:opacity-50"
          >
            {loadingPlan === "pro_yearly" ? "Redirecting..." : "Choose yearly"}
          </button>
        </section>
      </div>
    </>
  );
}
