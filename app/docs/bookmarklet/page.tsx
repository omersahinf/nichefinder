import Link from "next/link";
import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "Bookmarklet",
  description: "Drag this bookmarklet to your bookmarks bar to quickly add YouTube channels to NicheFinder seed list.",
};

const bookmarkletCode = `javascript:(function(){var u=encodeURIComponent(location.href);var base='${siteUrl()}';window.open(base+'/admin/seeds?channelUrl='+u,'_blank');})();`;

export default function BookmarkletPage() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mb-8 mt-6">
          <h1 className="text-3xl font-bold tracking-tight">Bookmarklet</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Quickly add YouTube channels to NicheFinder from any YouTube page.
          </p>
        </header>

        <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">Installation</h2>
          <p className="mt-3 text-sm leading-7 text-neutral-300">
            Drag the button below to your browser bookmarks bar. When you are on a YouTube channel
            or video page, click the bookmarklet to open NicheFinder admin seeds page with the URL
            pre-filled.
          </p>

          <div className="mt-6">
            <a
              href={bookmarkletCode}
              className="inline-block rounded-lg bg-red-600 px-6 py-3 text-sm font-semibold text-white hover:bg-red-500"
            >
              Add to NicheFinder
            </a>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            Works on: YouTube channel pages, @handle URLs, /c/ custom URLs, /user/ URLs, and video
            watch pages.
          </p>
        </section>

        <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">How it works</h2>
          <ol className="mt-4 space-y-3 text-sm leading-7 text-neutral-300">
            <li>
              1. Navigate to any YouTube page (channel, handle, custom URL, or video watch page).
            </li>
            <li>
              2. Click the bookmarklet in your bookmarks bar.
            </li>
            <li>
              3. NicheFinder admin seeds page opens with the URL pre-filled.
            </li>
            <li>
              4. Review the channel ID and click &quot;Add manually&quot; to add it to the seed list.
            </li>
          </ol>
        </section>

        <section className="mb-8 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">Bookmarklet code</h2>
          <p className="mt-3 text-sm text-neutral-400">
            For manual installation, copy this code and create a new bookmark with it as the URL:
          </p>
          <pre className="mt-4 overflow-x-auto rounded bg-neutral-950 p-4 text-xs text-neutral-200">
            <code>{bookmarkletCode}</code>
          </pre>
        </section>

        <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h2 className="text-lg font-semibold">Requirements</h2>
          <ul className="mt-4 space-y-2 text-sm text-neutral-300">
            <li>Admin access required to add seeds</li>
            <li>Browser with bookmarks bar enabled</li>
            <li>JavaScript enabled</li>
          </ul>
        </section>
      </div>
    </main>
  );
}