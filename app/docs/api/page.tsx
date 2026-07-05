import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "API Docs",
  description: "Public API documentation for NicheFinder search queries and Bearer token usage.",
};

export default function ApiDocsPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mb-8 mt-6">
          <h1 className="text-3xl font-bold tracking-tight">API</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Use Bearer-authenticated search requests against the shared NicheFinder database.
            YouTube refresh is explicit and keyword-only.
          </p>
        </header>

        <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">Authentication</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-300">
            Create an API key from <Link href="/account/api-keys" className="text-red-300 hover:text-red-200">/account/api-keys</Link>.
            Send it as `Authorization: Bearer YOUR_KEY`.
          </p>
        </section>

        <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">Endpoint</h2>
          <pre className="mt-4 overflow-x-auto rounded bg-neutral-950 p-4 text-sm text-neutral-200">
            <code>GET /api/v1/search?q=faceless+finance&amp;pageSize=100&amp;minOutlier=2&amp;sort=outlier</code>
          </pre>
        </section>

        <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">Parameters</h2>
          <div className="mt-4 grid gap-3 text-sm text-neutral-300">
            <div><code>q</code> optional query string; omit it for filter-only browsing</div>
            <div><code>page</code>, <code>pageSize</code> DB pagination; default page size 100, max 500</div>
            <div><code>apiFetchSize</code> YouTube refresh fetch size; default 50, max 200</div>
            <div><code>minSubs</code>, <code>maxSubs</code> subscriber range</div>
            <div><code>days</code> relative date window</div>
            <div><code>publishedAfter</code>, <code>publishedBefore</code> ISO or YYYY-MM-DD</div>
            <div><code>minDurationSeconds</code>, <code>maxDurationSeconds</code></div>
            <div><code>minViews</code>, <code>minOutlier</code></div>
            <div><code>format</code> one of <code>all</code>, <code>standard</code>; short clips are quarantined from public results</div>
            <div><code>sort</code> one of <code>outlier</code>, <code>views</code>, <code>date</code>, <code>subs</code></div>
            <div><code>forceRefresh=1</code> or <code>force=1</code> refreshes YouTube for keyword searches, then returns database results</div>
          </div>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">Example</h2>
          <pre className="mt-4 overflow-x-auto rounded bg-neutral-950 p-4 text-sm text-neutral-200">
            <code>{`curl -H "Authorization: Bearer nf_live_..." \\
  "${process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"}/api/v1/search?q=ai+tools&minOutlier=2&pageSize=100"`}</code>
          </pre>
        </section>
      </div>
    </main>
  );
}
