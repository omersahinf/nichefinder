import { getLatestNicheSnapshot } from "@/lib/cache";
import { computeSaturation } from "@/lib/saturation";
import { keywordFromSlug } from "@/lib/niche-utils";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: "NicheFinder Embed",
    robots: {
      index: false,
      follow: false,
    },
  };
}

type EmbedNicheProps = {
  params: Promise<{ slug: string }>;
};

const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
};

export default async function EmbedNichePage({ params }: EmbedNicheProps) {
  const { slug } = await params;
  const keyword = keywordFromSlug(slug);
  const snapshot = await getLatestNicheSnapshot(keyword);
  const results = snapshot?.results ?? [];
  const saturation = computeSaturation(results);

  const topVideos = [...results].sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 5);

  const saturationColor =
    saturation?.level === "low"
      ? "bg-emerald-500"
      : saturation?.level === "medium"
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 font-sans">
      <header className="mb-4">
        <h1 className="text-lg font-bold truncate">{snapshot?.keyword ?? keyword}</h1>
        <div className="mt-2 flex items-center gap-2">
          <span className={`inline-block px-2 py-1 rounded text-xs font-semibold text-white ${saturationColor}`}>
            {saturation?.label ?? "Unknown"}
          </span>
          {saturation && (
            <span className="text-xs text-neutral-400">
              {saturation.totalChannels} channels, {saturation.avgOutlier.toFixed(1)}x avg outlier
            </span>
          )}
        </div>
      </header>

      {topVideos.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Top Outliers</h2>
          {topVideos.map((video) => (
            <a
              key={video.id}
              href={`https://youtube.com/watch?v=${video.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-900/50 p-2 hover:border-neutral-700"
            >
              {video.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.thumbnail}
                  alt=""
                  className="h-16 w-24 rounded object-cover"
                  loading="lazy"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{video.title}</div>
                <div className="truncate text-xs text-neutral-500">{video.channelTitle}</div>
                <div className="mt-1 flex gap-2 text-xs">
                  <span className="text-red-300">{video.outlierScore.toFixed(1)}x</span>
                  <span className="text-neutral-400">{fmt(video.views)} views</span>
                </div>
              </div>
            </a>
          ))}
        </section>
      ) : (
        <div className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-400">
          No cached results for this niche.
        </div>
      )}

      <footer className="mt-4 pt-2 border-t border-neutral-800">
        <a
          href={`/niche/${slug}?q=${encodeURIComponent(keyword)}`}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-red-400 hover:text-red-300"
        >
          View full details on NicheFinder
        </a>
      </footer>
    </div>
  );
}