import { Suspense } from "react";
import type { Metadata } from "next";
import { SearchPageClient } from "../search-page-client";
import { getCurrentAuthIdentity } from "@/lib/auth";

export const metadata: Metadata = {
  title: "App",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AppHomePage() {
  const identity = await getCurrentAuthIdentity();

  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
          <div className="mx-auto max-w-7xl text-sm text-neutral-500">Loading...</div>
        </main>
      }
    >
      <SearchPageClient
        adminShortcutsEnabled={process.env.ADMIN_UI_ENABLED === "true"}
        userEmail={identity?.email}
        userAvatarUrl={identity?.avatarUrl}
      />
    </Suspense>
  );
}
