import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "YouTube Outlier Score Explained",
  description:
    "What a YouTube outlier score measures, why it matters more than raw views, and how to avoid misreading it.",
};

export default function OutlierExplainedPost() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <article className="mx-auto max-w-3xl">
        <Link href="/blog" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mb-10 mt-6">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-red-300">
            Outlier Analysis
          </div>
          <h1 className="mt-4 text-4xl font-bold tracking-tight">
            YouTube outlier score explained
          </h1>
          <p className="mt-4 text-base leading-8 text-neutral-300">
            Raw views are easy to read and easy to misuse. Outlier score matters because it asks a
            better question: how much did this video outperform what the channel usually does?
          </p>
        </header>

        <div className="space-y-8 text-sm leading-8 text-neutral-300">
          <section>
            <h2 className="text-xl font-semibold text-white">What an outlier actually measures</h2>
            <p className="mt-3">
              At a basic level, outlier score is the ratio between a video’s views and the channel’s
              typical average views. A 5x outlier means the video performed roughly five times above
              the baseline. That tells you something raw views cannot: whether the format, topic, or
              packaging broke out relative to channel size.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Why raw views are not enough</h2>
            <p className="mt-3">
              A 300K-view video on a channel that usually gets 500K is not a breakout. A 90K-view
              video on a channel that usually gets 12K often is. If you optimize around raw views,
              you overfit to established channels and miss niches where smaller operators are still
              discovering successful angles.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">How to use outliers in niche research</h2>
            <p className="mt-3">
              Look for clusters, not isolated spikes. One extreme outlier can be luck, distribution,
              or off-topic traffic. Multiple outliers across related channels with similar hooks are
              much more meaningful. That is where you start seeing evidence of repeatable demand.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">Where people misread the signal</h2>
            <p className="mt-3">
              Outlier score is not a guarantee of business quality. A niche can have strong outliers
              and still be weak on monetization, hard to produce, or too dependent on trends. Use it
              with saturation, format repeatability, and RPM context. It is a high-value signal, not
              a standalone verdict.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white">What to do with it operationally</h2>
            <p className="mt-3">
              Use outliers to reverse-engineer the niche: title pattern, audience promise, thumbnail
              packaging, runtime, publishing cadence, and channel size distribution. The goal is not
              to copy a single winning video. The goal is to understand why the niche keeps producing
              winners and whether that pattern is still open.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
