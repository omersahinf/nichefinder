import Link from "next/link";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { getSubscriptionByUserId } from "@/lib/billing";
import PricingClient from "./pricing-client";

export default async function PricingPage() {
  const identity = await getCurrentAuthIdentity();
  const subscription = identity ? await getSubscriptionByUserId(identity.id) : null;

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mb-8 mt-6">
          <h1 className="text-3xl font-bold tracking-tight">Pricing</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Upgrade when you need alerts, CSV export, AI analysis, and unlimited usage.
          </p>
          {subscription && (
            <div className="mt-4 inline-flex rounded border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-sm text-neutral-300">
              Current plan: {subscription.plan} ({subscription.status})
            </div>
          )}
        </header>

        <PricingClient />
      </div>
    </main>
  );
}
