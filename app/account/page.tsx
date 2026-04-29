import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { entitlementFromSubscription, getSubscriptionByUserId } from "@/lib/billing";
import AccountClient from "./account-client";

export default async function AccountPage() {
  const identity = await getCurrentAuthIdentity();
  if (!identity) redirect("/login?next=/account");

  const subscription = await getSubscriptionByUserId(identity.id);
  const entitlement = entitlementFromSubscription(subscription);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mb-8 mt-6">
          <h1 className="text-3xl font-bold tracking-tight">Account</h1>
          <p className="mt-2 text-sm text-neutral-400">{identity.email}</p>
        </header>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500">Plan</div>
              <div className="mt-1 text-lg font-semibold">{entitlement}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500">Status</div>
              <div className="mt-1 text-lg font-semibold">{subscription?.status ?? "inactive"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-neutral-500">Renews</div>
              <div className="mt-1 text-lg font-semibold">
                {subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString("en-US")
                  : "-"}
              </div>
            </div>
          </div>

          <AccountClient canManageBilling={Boolean(subscription?.stripeCustomerId)} />

          <div className="mt-6 border-t border-neutral-800 pt-6">
            <Link
              href="/account/api-keys"
              className="inline-flex rounded-lg border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm font-semibold text-neutral-100 hover:border-red-500"
            >
              Manage API keys
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
