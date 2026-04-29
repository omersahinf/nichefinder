import Link from "next/link";
import { getLatestNicheSnapshot } from "@/lib/cache";
import { computeSaturation } from "@/lib/saturation";
import { keywordFromSlug } from "@/lib/niche-utils";
import { SaturationBarsChart, VideoTimelineChart } from "@/app/components/charts";
import { findSimilarChannels } from "@/lib/similar";
import { getCurrentAdminIdentity } from "@/lib/auth";
import AiAnalysisCard from "./ai-analysis-card";
import IdeaFinderCard from "./idea-finder-card";
import TitleGeneratorCard from "./title-generator-card";
import ThumbnailPatternsCard from "./thumbnail-patterns-card";

export const dynamic = "force-dynamic";

type NichePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
};

const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
};

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

const daysAgo = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NichePage({ params, searchParams }: NichePageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const keyword = firstParam(query.q)?.trim() || keywordFromSlug(slug);
  const snapshot = await getLatestNicheSnapshot(keyword);
  const results = snapshot?.results ?? [];
  const saturation = computeSaturation(results);
  const adminIdentity = await getCurrentAdminIdentity();

  const channelMap = results.reduce((map, video) => {
      const existing = map.get(video.channelId);
      if (!existing || video.outlierScore > existing.bestOutlier) {
        map.set(video.channelId, {
          id: video.channelId,
          title: video.channelTitle,
          subs: video.channelSubs,
          bestOutlier: video.outlierScore,
          bestVideo: video.title,
          thumbnail: video.channelThumbnail,
        });
      }
      return map;
    }, new Map<string, { id: string; title: string; subs: number; bestOutlier: number; bestVideo: string; thumbnail?: string }>());

  const topChannels = Array.from(channelMap.values())
    .sort((a, b) => b.bestOutlier - a.bestOutlier)
    .slice(0, 10);
  const similarChannels = topChannels[0]
    ? await findSimilarChannels(topChannels[0].id, 10)
    : [];

  const topVideos = [...results].sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 10);
  const totalEstimatedRevenue = topVideos.reduce(
    (sum, video) => sum + (video.estimatedRevenueUsd ?? 0),
    0,
  );
  const categoryDistribution = Array.from(
    results.reduce((map, video) => {
      const category = video.category ?? "other";
      map.set(category, (map.get(category) ?? 0) + 1);
      return map;
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]);

  const timeline = [...results]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 12);
  const timelineChartData = [...timeline]
    .reverse()
    .map((video) => ({
      date: new Date(video.publishedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      title: video.title,
      views: video.views,
    }));

  const bars = saturation
    ? [
        {
          label: "Small channels",
          value: saturation.smallChannelRatio,
          display: `${(saturation.smallChannelRatio * 100).toFixed(0)}%`,
        },
        {
          label: "Small-channel outliers",
          value: saturation.smallOutlierRatio,
          display: `${(saturation.smallOutlierRatio * 100).toFixed(0)}%`,
        },
        {
          label: "Average outlier",
          value: Math.min(saturation.avgOutlier / 10, 1),
          display: `${saturation.avgOutlier.toFixed(1)}x`,
        },
      ]
    : [];

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Link href="/app" className="text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <header className="mt-6 mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="break-words text-3xl font-bold tracking-tight">{keyword}</h1>
            <p className="mt-2 text-sm text-neutral-400">
              {snapshot
                ? `${results.length} cached results, source: ${snapshot.source}`
                : "No cache record found"}
            </p>
          </div>
          {snapshot?.fetchedAt && (
            <div className="font-mono text-sm text-neutral-500">
              {new Date(snapshot.fetchedAt).toLocaleString("en-US")}
            </div>
          )}
        </header>

        {!snapshot && (
          <div className="rounded-lg border border-dashed border-neutral-800 p-10 text-neutral-400">
            No Supabase cache record exists for this niche. Add Supabase credentials and run
            a search from the home page to see details here.
          </div>
        )}

        {snapshot && saturation && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <AiAnalysisCard keyword={keyword} slug={slug} />
            <TitleGeneratorCard keyword={keyword} slug={slug} />
            <IdeaFinderCard keyword={keyword} slug={slug} />
            <ThumbnailPatternsCard keyword={keyword} videos={results} isAdmin={Boolean(adminIdentity)} />

            <section className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Saturation</h2>
                  <p className="mt-1 text-sm text-neutral-400">{saturation.hint}</p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs font-semibold uppercase tracking-wider ${
                    saturation.level === "low"
                      ? "bg-emerald-500/20 text-emerald-300"
                      : saturation.level === "medium"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-red-500/20 text-red-300"
                  }`}
                >
                  {saturation.label}
                </span>
              </div>

              <SaturationBarsChart data={bars} />

              <div className="mt-6 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs uppercase tracking-wider text-neutral-500">Channels</div>
                  <div className="font-mono text-lg">{saturation.totalChannels}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-neutral-500">Median</div>
                  <div className="font-mono text-lg">{fmt(saturation.medianSubs)}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wider text-neutral-500">Outlier</div>
                  <div className="font-mono text-lg">{saturation.avgOutlier.toFixed(1)}x</div>
                </div>
              </div>
            </section>

            <section className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-900/40 p-5">
              <h2 className="mb-4 text-lg font-semibold">Top 10 channels</h2>
              <div className="space-y-3">
                {topChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="grid grid-cols-[1fr_auto] gap-3 border-b border-neutral-800 pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium">{channel.title}</div>
                      <div className="truncate text-xs text-neutral-500">{channel.bestVideo}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-red-300">
                        {channel.bestOutlier.toFixed(1)}x
                      </div>
                      <div className="font-mono text-xs text-neutral-500">
                        {fmt(channel.subs)} subs
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {similarChannels.length > 0 && (
              <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 lg:col-span-2">
                <h2 className="mb-4 text-lg font-semibold">Similar channels</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {similarChannels.map((channel) => (
                    <a
                      key={channel.channelId}
                      href={`https://youtube.com/channel/${channel.channelId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-950/50 p-3 hover:border-neutral-700"
                    >
                      {channel.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={channel.thumbnail}
                          alt=""
                          className="h-10 w-10 rounded-full object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{channel.title}</div>
                        <div className="font-mono text-xs text-neutral-500">
                          {fmt(channel.subs)} subs
                        </div>
                      </div>
                      <div className="font-mono text-xs text-emerald-300">
                        {(channel.similarity * 100).toFixed(0)}%
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}

            <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 lg:col-span-2">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Category distribution</h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Estimated revenue across top 10 videos:{" "}
                    <span className="font-mono text-neutral-200">
                      {fmtUsd(totalEstimatedRevenue)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
                {categoryDistribution.map(([category, count]) => (
                  <div key={category} className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
                    <div className="text-xs uppercase tracking-wider text-neutral-500">
                      {category}
                    </div>
                    <div className="mt-1 font-mono text-xl">{count}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 lg:col-span-2">
              <h2 className="mb-4 text-lg font-semibold">Video timeline</h2>
              <VideoTimelineChart data={timelineChartData} />
              <div className="space-y-3 md:hidden">
                {timeline.map((video) => (
                  <article
                    key={video.id}
                    className="rounded border border-neutral-800 bg-neutral-950/50 p-3"
                  >
                    <a
                      href={`https://youtube.com/watch?v=${video.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="line-clamp-2 text-sm font-medium leading-snug hover:text-red-400"
                    >
                      {video.title}
                    </a>
                    <div className="mt-1 truncate text-xs text-neutral-500">
                      {video.channelTitle}
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
                        <div className="uppercase tracking-wider text-neutral-500">Age</div>
                        <div className="font-mono text-neutral-100">
                          {daysAgo(video.publishedAt)}
                        </div>
                      </div>
                      <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
                        <div className="uppercase tracking-wider text-neutral-500">Views</div>
                        <div className="font-mono text-neutral-100">{fmt(video.views)}</div>
                      </div>
                      <div className="rounded border border-neutral-800 bg-neutral-900/50 p-2">
                        <div className="uppercase tracking-wider text-neutral-500">Outlier</div>
                        <div className="font-mono text-red-300">
                          {video.outlierScore.toFixed(1)}x
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 line-clamp-2 text-xs text-neutral-300">
                      {video.outlierReason}
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-[820px] w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="py-2 pr-4">Video</th>
                      <th className="py-2 pr-4 text-right">Age</th>
                      <th className="py-2 pr-4 text-right">Views</th>
                      <th className="py-2 pr-4 text-right">Outlier</th>
                      <th className="py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {timeline.map((video) => (
                      <tr key={video.id}>
                        <td className="py-3 pr-4">
                          <a
                            href={`https://youtube.com/watch?v=${video.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="line-clamp-1 font-medium hover:text-red-400"
                          >
                            {video.title}
                          </a>
                          <div className="text-xs text-neutral-500">{video.channelTitle}</div>
                        </td>
                        <td className="py-3 pr-4 text-right text-neutral-400">
                          {daysAgo(video.publishedAt)}
                        </td>
                        <td className="py-3 pr-4 text-right font-mono">{fmt(video.views)}</td>
                        <td className="py-3 pr-4 text-right font-mono text-red-300">
                          {video.outlierScore.toFixed(1)}x
                        </td>
                        <td className="py-3 text-neutral-300">{video.outlierReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
