import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuthIdentity } from "@/lib/auth";
import { enforceQuota } from "@/lib/billing";
import ApiKeysClient from "./api-keys-client";

export default async function ApiKeysPage() {
  const identity = await getCurrentAuthIdentity();
  if (!identity) redirect("/login?next=/account/api-keys");

  const quota = await enforceQuota(identity.id, "api_access");

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/account" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mb-8 mt-6">
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Generate Bearer tokens for the public search API.
          </p>
        </header>

        {!quota.allowed ? (
          <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-6 text-sm text-amber-100">
            {quota.reason ?? "API access requires Pro."}{" "}
            <Link href="/pricing" className="font-semibold text-amber-200 underline">
              Upgrade to Pro
            </Link>
            .
          </div>
        ) : (
          <ApiKeysClient />
        )}
      </div>
    </main>
  );
}
