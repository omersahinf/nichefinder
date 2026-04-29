import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Guides on YouTube niche research, outliers, and content opportunity analysis.",
};

const posts = [
  {
    href: "/blog/how-to-find-faceless-niches",
    title: "How to find faceless YouTube niches",
    description:
      "A practical framework for screening niches by saturation, outliers, monetization, and repeatable formats.",
  },
  {
    href: "/blog/youtube-outlier-explained",
    title: "YouTube outlier score explained",
    description:
      "What an outlier is, why baseline-relative performance matters, and how to read it without fooling yourself.",
  },
];

export default function BlogIndexPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mb-10 mt-6">
          <h1 className="text-4xl font-bold tracking-tight">Blog</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
            Practical writing on niche discovery, outlier analysis, and turning YouTube data into
            better content decisions.
          </p>
        </header>

        <div className="space-y-4">
          {posts.map((post) => (
            <Link
              key={post.href}
              href={post.href}
              className="block rounded-lg border border-neutral-800 bg-neutral-900/50 p-5 hover:border-red-500"
            >
              <h2 className="text-xl font-semibold tracking-tight">{post.title}</h2>
              <p className="mt-2 text-sm leading-7 text-neutral-400">{post.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
