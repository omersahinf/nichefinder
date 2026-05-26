"use client";

import { useState } from "react";
import type { ChannelGroup } from "@/lib/group-by-channel";
import type { EnrichedVideo } from "@/lib/search-types";
import { formatDurationLabel } from "@/lib/duration";
import { buildOutlierExplanation } from "@/lib/outlier-reasons";
import { OutlierBadge, Badge } from "./ui";

const fmt = (n: number): string => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

const daysAgo = (iso: string): string => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

function videoBadges(v: EnrichedVideo): string[] {
  const badges: string[] = [];
  if (v.outlierScore >= 8 && v.channelSubs < 50_000) badges.push("Small channel winner");
  if (v.outlierScore >= 12) badges.push("Breakout format");
  if (v.isShort) badges.push("Shorts");
  return badges;
}

function channelAgeLabel(createdAt?: string): string {
  if (!createdAt) return "";
  const years = (Date.now() - new Date(createdAt).getTime()) / (365.25 * 86400000);
  if (years < 1) return `${Math.floor(years * 12)}mo old`;
  return `${years.toFixed(1)}y old`;
}

interface VideoRowProps {
  video: EnrichedVideo;
  isMock: boolean;
  compact: boolean;
}

function VideoRow({ video: v, isMock, compact: isCompact }: VideoRowProps) {
  const [expanded, setExpanded] = useState(false);
  const videoUrl = !isMock ? `https://youtube.com/watch?v=${v.id}` : undefined;
  const badges = videoBadges(v);
  const explanation = buildOutlierExplanation(v);

  return (
    <div className="group">
      <div
        className={`flex items-center gap-3 transition-colors hover:bg-neutral-800/30 ${
          isCompact ? "py-1.5 px-4" : "py-2 px-4"
        }`}
      >
        {/* Thumbnail */}
        <a
          href={videoUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => !videoUrl && e.preventDefault()}
          className={`relative flex-shrink-0 overflow-hidden rounded bg-neutral-800 block ${
            isCompact ? "h-8 w-14" : "h-10 w-16"
          }`}
        >
          {v.thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
          )}
          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-0.5 text-[9px] font-mono text-white">
            {formatDurationLabel(v.durationSeconds ?? 0)}
          </span>
        </a>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => !videoUrl && e.preventDefault()}
            className="line-clamp-1 text-xs font-medium text-neutral-200 hover:text-red-300 transition-colors"
          >
            {v.title}
          </a>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[11px] text-neutral-500">{fmt(v.views)} views</span>
            <span className="text-[11px] text-neutral-600">·</span>
            <span className="text-[11px] text-neutral-500">{daysAgo(v.publishedAt)}</span>
            {badges.slice(0, 1).map((b) => (
              <Badge key={b} label={b} />
            ))}
          </div>
        </div>

        {/* Outlier score */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <OutlierBadge score={v.outlierScore} />
          {v.outlierReason && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-[11px] text-neutral-600 hover:text-neutral-400 transition-colors"
              title="Why is this an outlier?"
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
        </div>
      </div>

      {/* Outlier explanation expand */}
      {expanded && (
        <div className="mx-4 mb-2 rounded border border-neutral-800 bg-neutral-900/60 px-3 py-2.5 space-y-1.5">
          <div className="text-[11px] font-medium text-neutral-300">{explanation.summary}</div>
          {explanation.factors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {explanation.factors.map((f, i) => (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium border ${
                    f.signal === "positive"
                      ? "bg-green-500/10 text-green-300 border-green-500/20"
                      : f.signal === "note"
                      ? "bg-neutral-800 text-neutral-400 border-neutral-700"
                      : "bg-neutral-800/50 text-neutral-500 border-neutral-700/50"
                  }`}
                >
                  <span className="opacity-60">{f.label}:</span> {f.value}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  group: ChannelGroup;
  isMock?: boolean;
  compact?: boolean;
}

export function ChannelGroupCard({ group, isMock = false, compact: isCompact = false }: Props) {
  const [expanded, setExpanded] = useState(true);
  const channelUrl = !isMock ? `/channel/${group.channelId}` : undefined;
  const youtubeChannelUrl = !isMock ? `https://youtube.com/channel/${group.channelId}` : undefined;

  const subsLabel = fmt(group.channelSubs);
  const ageLabel = channelAgeLabel(group.channelCreatedAt);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 overflow-hidden">
      {/* Channel header */}
      <div
        className={`flex items-center gap-3 border-b border-neutral-800 bg-neutral-900/80 ${
          isCompact ? "px-4 py-2.5" : "px-4 py-3"
        }`}
      >
        {/* Avatar */}
        <a
          href={channelUrl}
          onClick={(e) => !channelUrl && e.preventDefault()}
          className="flex-shrink-0 h-9 w-9 rounded-full bg-neutral-800 overflow-hidden"
        >
          {group.channelThumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.channelThumbnail} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-neutral-600 text-sm font-semibold">
              {group.channelTitle.charAt(0).toUpperCase()}
            </div>
          )}
        </a>

        {/* Channel info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={channelUrl}
              onClick={(e) => !channelUrl && e.preventDefault()}
              className="text-sm font-semibold text-neutral-100 hover:text-red-300 transition-colors truncate"
            >
              {group.channelTitle}
            </a>
            {youtubeChannelUrl && (
              <a href={youtubeChannelUrl} target="_blank" rel="noopener noreferrer"
                className="text-[10px] text-neutral-700 hover:text-neutral-400 transition-colors">↗ YT</a>
            )}
            {group.channelCountry && (
              <span className="text-[11px] text-neutral-600">{group.channelCountry}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-neutral-500">{subsLabel} subs</span>
            {ageLabel && (
              <>
                <span className="text-[11px] text-neutral-700">·</span>
                <span className="text-[11px] text-neutral-500">{ageLabel}</span>
              </>
            )}
            <span className="text-[11px] text-neutral-700">·</span>
            <span className="text-[11px] text-neutral-500">
              {group.totalVideosInNiche} video{group.totalVideosInNiche !== 1 ? "s" : ""} in niche
            </span>
          </div>
        </div>

        {/* Outlier score badge */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <div className="text-right">
            <div className="text-[10px] text-neutral-600 uppercase tracking-wide">Best</div>
            <OutlierBadge score={group.bestOutlierScore} />
          </div>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="text-neutral-600 hover:text-neutral-300 transition-colors ml-1"
            title={expanded ? "Collapse videos" : "Expand videos"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className={`transition-transform ${expanded ? "rotate-180" : "rotate-0"}`}
            >
              <path
                d="M3 5l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Videos list */}
      {expanded && (
        <div className="divide-y divide-neutral-800/50">
          {group.topVideos.map((video) => (
            <VideoRow
              key={video.id}
              video={video}
              isMock={isMock}
              compact={isCompact}
            />
          ))}
        </div>
      )}
    </div>
  );
}
