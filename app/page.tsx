import Link from "next/link";
import { getCurrentAuthIdentity } from "@/lib/auth";

export default async function Home() {
  const identity = await getCurrentAuthIdentity();

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <section className="border-b border-neutral-900 bg-[radial-gradient(circle_at_top_left,_rgba(239,68,68,0.14),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_28%),linear-gradient(180deg,_#111111_0%,_#0a0a0a_100%)]">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xl font-semibold tracking-tight">
              NicheFinder<span className="text-red-500">.</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/pricing"
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-100 hover:border-red-500"
              >
                Pricing
              </Link>
              {identity ? (
                <Link
                  href="/app"
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
                >
                  Open app
                </Link>
              ) : (
                <>
                  <Link
                    href="/login?next=/app"
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-semibold text-neutral-100 hover:border-red-500"
                  >
                    Login
                  </Link>
                  <Link
                    href="/app"
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500"
                  >
                    Try app
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-6 pb-20 pt-8 sm:pb-28 sm:pt-14">
          <div className="max-w-3xl">
            <div className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-red-300">
              YouTube niche discovery
            </div>
            <h1 className="text-5xl font-bold tracking-tight text-white sm:text-6xl">
              Find niches with real outliers, not guesswork.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-300">
              Search YouTube niches, inspect outlier videos, compare similar channels,
              estimate revenue, and keep a seed graph running in the background.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/app"
                className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500"
              >
                Open search workspace
              </Link>
              <Link
                href="/blog/how-to-find-faceless-niches"
                className="rounded-lg border border-neutral-800 bg-neutral-900/70 px-5 py-3 text-sm font-semibold text-neutral-100 hover:border-red-500"
              >
                Read the guide
              </Link>
            </div>
          </div>

          <div className="mt-14 grid gap-6 border-t border-neutral-900 pt-8 md:grid-cols-3">
            <div>
              <div className="text-sm font-semibold text-neutral-200">Outlier-first ranking</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Surface videos outperforming channel baselines instead of sorting raw views.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-200">Live cache + cron</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                Seed channels and scheduled refreshes keep the database useful between searches.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-200">Revenue context</div>
              <p className="mt-2 text-sm leading-6 text-neutral-400">
                RPM-based estimates help separate viral niches from commercially viable ones.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-neutral-900 bg-neutral-950">
        <div className="mx-auto grid max-w-6xl gap-12 px-6 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Built for repeated analysis</h2>
            <div className="mt-8 grid gap-8 sm:grid-cols-2">
              <div>
                <div className="text-sm font-semibold text-neutral-200">Advanced filters</div>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Subscriber range, duration, date windows, browse mode, active chips, and
                  shareable URLs.
                </p>
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-200">Saved searches</div>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Keep recurring niches one click away and restore the exact filter state later.
                </p>
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-200">Similar channels</div>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Jump from one breakout channel to nearby competitors without leaving the niche.
                </p>
              </div>
              <div>
                <div className="text-sm font-semibold text-neutral-200">CSV export</div>
                <p className="mt-2 text-sm leading-6 text-neutral-400">
                  Export filtered result sets for external research, planning, or reporting.
                </p>
              </div>
            </div>
          </div>

          <div className="border-l-0 border-neutral-900 pl-0 lg:border-l lg:pl-12">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">
              Pricing snapshot
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-lg font-semibold">Free</div>
                  <div className="text-2xl font-bold">$0</div>
                </div>
                <p className="mt-2 text-sm text-neutral-400">10 searches/day, 5 saves, no CSV.</p>
              </div>
              <div className="rounded-lg border border-red-900 bg-red-950/20 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-lg font-semibold text-red-200">Pro</div>
                  <div className="text-2xl font-bold">$9</div>
                </div>
                <p className="mt-2 text-sm text-neutral-300">
                  Unlimited searches, CSV export, alerts, and account billing controls.
                </p>
              </div>
            </div>
            <Link
              href="/pricing"
              className="mt-6 inline-flex rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm font-semibold text-neutral-100 hover:border-red-500"
            >
              View pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-neutral-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-lg font-semibold">Start with the app, not a demo.</div>
            <p className="mt-2 text-sm text-neutral-400">
              Search the database, inspect niche detail pages, and iterate on filters immediately.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/app"
              className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Open app
            </Link>
            <Link
              href="/blog/youtube-outlier-explained"
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-5 py-3 text-sm font-semibold text-neutral-100 hover:border-red-500"
            >
              Learn outliers
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
