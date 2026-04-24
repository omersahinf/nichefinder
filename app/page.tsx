import { Suspense } from "react";
import { SearchPageClient } from "./search-page-client";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
          <div className="mx-auto max-w-7xl text-sm text-neutral-500">Loading...</div>
        </main>
      }
    >
      <SearchPageClient />
    </Suspense>
  );
}
