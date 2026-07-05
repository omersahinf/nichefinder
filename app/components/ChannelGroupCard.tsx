"use client";

import Link from "next/link";
import type { ChannelGroup } from "@/lib/group-by-channel";
import type { EnrichedVideo } from "@/lib/search-types";
import { formatDurationLabel } from "@/lib/duration";
import { OutlierBadge, Badge } from "./ui";

const fmt = (n: number): string => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
};

const fmtUsd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1_000 ? 0 : 1,
  }).format(n);

const daysAgo = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(d) || d < 0) return "";
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

const rangeLabel = (
  range: { min: number; max: number } | undefined,
  formatter: (n: number) => string,
): string => {
  if (!range) return "";
  if (Math.round(range.min) === Math.round(range.max)) return formatter(range.max);
  return `${formatter(range.min)} - ${formatter(range.max)}`;
};

const rpmLabel = (range: { min: number; max: number } | undefined): string =>
  rangeLabel(range, (n) => `$${n.toFixed(n >= 10 ? 0 : 1)}`);

const revenueLabel = (range: { min: number; max: number } | undefined): string =>
  rangeLabel(range, fmtUsd);

const latestVideoAge = (videos: EnrichedVideo[]): string => {
  const latest = videos
    .map((video) => new Date(video.publishedAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return typeof latest === "number" ? daysAgo(new Date(latest).toISOString()) : "";
};

function channelHandle(group: ChannelGroup): string {
  return group.channelId.startsWith("@") ? group.channelId : group.channelId;
}

function metric(label: string, value: string, className = "") {
  if (!value) return null;
  return (
    <div key={label} className={`min-w-0 ${className}`}>
      <div className="text-[11px] font-semibold text-neutral-500">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-neutral-200">{value}</div>
    </div>
  );
}

interface VideoCardProps {
  video: EnrichedVideo;
  isMock: boolean;
}

function VideoCard({ video, isMock }: VideoCardProps) {
  const videoUrl = !isMock ? `https://youtube.com/watch?v=${video.id}` : undefined;
  const age = daysAgo(video.publishedAt);

  return (
    <a
      href={videoUrl ?? "#"}
      target={videoUrl ? "_blank" : undefined}
      rel={videoUrl ? "noopener noreferrer" : undefined}
      onClick={(event) => !videoUrl && event.preventDefault()}
      className="group block min-w-0"
    >
      <div className="relative aspect-video overflow-hidden rounded-md bg-neutral-900">
        {video.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail}
            alt=""
            className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-900 text-xs text-neutral-700">
            No thumbnail
          </div>
        )}
        <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {formatDurationLabel(video.durationSeconds ?? 0)}
        </span>
      </div>
      <div className="mt-3 line-clamp-2 min-h-[2.6rem] text-sm font-semibold leading-snug text-neutral-100 transition-colors group-hover:text-red-300">
        {video.title}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        {video.outlierScore >= 5 && <Badge label="Outlier" />}
        <span className="font-mono">{fmt(video.views)} views</span>
        {age && <span>{age}</span>}
      </div>
    </a>
  );
}

interface Props {
  group: ChannelGroup;
  isMock?: boolean;
  compact?: boolean;
  showRevenue?: boolean;
}

export function ChannelGroupCard({
  group,
  isMock = false,
  compact = false,
  showRevenue = false,
}: Props) {
  const channelUrl = !isMock ? `/channel/${group.channelId}` : "#";
  const youtubeChannelUrl = !isMock ? `https://youtube.com/channel/${group.channelId}` : undefined;
  const spotted = latestVideoAge(group.topVideos);
  const avgVsSubs =
    group.channelSubs > 0 ? `${(group.typicalViews / group.channelSubs).toFixed(group.typicalViews / group.channelSubs >= 10 ? 1 : 2)}x` : "";

  const metrics = [
    metric("Subscribers", fmt(group.channelSubs)),
    showRevenue ? metric("Revenue", revenueLabel(group.revenueRange)) : null,
    showRevenue ? metric("RPM", rpmLabel(group.rpmRange)) : null,
    metric("Active since", group.activeSinceLabel),
    metric("Total videos", group.channelVideoCount ? fmt(group.channelVideoCount) : ""),
    metric("Typical views", fmt(group.typicalViews)),
    metric("Country", group.channelCountry ?? ""),
    metric("Content", group.contentType),
    metric("Latest", spotted),
  ].filter(Boolean);

  return (
    <article className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/70">
      <div
        className={`grid gap-4 border-b border-neutral-800 bg-neutral-950/80 ${
          compact ? "px-4 py-3" : "px-4 py-4"
        } lg:grid-cols-[minmax(260px,1.25fr)_minmax(0,2.75fr)]`}
      >
        <div className="flex min-w-0 items-center gap-4">
          <Link
            href={channelUrl}
            onClick={(event) => isMock && event.preventDefault()}
            className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-full bg-neutral-900 ring-1 ring-neutral-800"
          >
            {group.channelThumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={group.channelThumbnail} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-base font-bold text-neutral-500">
                {group.channelTitle.charAt(0).toUpperCase()}
              </div>
            )}
          </Link>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Link
                href={channelUrl}
                onClick={(event) => isMock && event.preventDefault()}
                className="truncate text-base font-bold text-neutral-100 underline decoration-neutral-600 underline-offset-4 transition-colors hover:text-red-300"
              >
                {group.channelTitle}
              </Link>
              {group.bestOutlierScore >= 10 && (
                <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                  Breakout
                </span>
              )}
            </div>
            <div className="mt-1 truncate text-xs text-neutral-500">{channelHandle(group)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-9">
          {metrics}
        </div>
      </div>

      <div className={compact ? "px-4 py-4" : "px-5 py-5"}>
        <div className="grid gap-4 md:grid-cols-3">
          {group.topVideos.map((video) => (
            <VideoCard key={video.id} video={video} isMock={isMock} />
          ))}
        </div>
      </div>

      {group.nicheChips.length > 0 && (
        <div className="border-t border-neutral-800 px-4 py-3">
          <div className="mb-2 text-xs font-semibold text-neutral-500">Niches</div>
          <div className="flex flex-wrap gap-2">
            {group.nicheChips.map((chip) => (
              <span
                key={chip}
                className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-300"
              >
                {chip}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 border-t border-neutral-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <OutlierBadge score={group.bestOutlierScore} />
          {avgVsSubs && (
            <span className="rounded bg-red-600 px-2 py-1 text-xs font-bold text-white">
              {avgVsSubs}
            </span>
          )}
          {avgVsSubs && (
            <span className="text-sm font-semibold text-neutral-200">
              {fmt(group.typicalViews)} typical views vs {fmt(group.channelSubs)} subs
            </span>
          )}
          <span className="text-xs text-neutral-500">
            {group.totalVideosInNiche} matched video{group.totalVideosInNiche === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={channelUrl}
            onClick={(event) => isMock && event.preventDefault()}
            className="rounded-md border border-neutral-700 bg-white px-3 py-1.5 text-xs font-bold text-neutral-950 transition-colors hover:bg-neutral-200"
          >
            Channel Report
          </Link>
          {youtubeChannelUrl && (
            <a
              href={youtubeChannelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-500"
            >
              YouTube
            </a>
          )}
          <button
            type="button"
            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-400 transition-colors hover:border-neutral-600 hover:text-neutral-100"
            title="More actions"
          >
            ...
          </button>
        </div>
      </div>
    </article>
  );
}
