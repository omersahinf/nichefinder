"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { EnrichedVideo } from "@/lib/search-types";
import { groupVideosByChannel } from "@/lib/group-by-channel";
import { formatDurationLabel } from "@/lib/duration";
import { daysAgo, fmt } from "@/lib/search-utils";
import { ChannelGroupCard } from "./ChannelGroupCard";
import { ResultsTable } from "./ResultsTable";
import { OutlierBadge, Panel, PanelHeader } from "./ui";

type ViewMode = "feed" | "channels" | "table";

interface Props {
  videos: EnrichedVideo[];
  showRevenue: boolean;
  source: string | null;
  totalCount: number;
  pageSize: number;
  onExportCsv: () => void;
  defaultView?: ViewMode;
}

export function ResultsView({
  videos,
  showRevenue,
  source,
  totalCount,
  pageSize,
  onExportCsv,
  defaultView = "feed",
}: Props) {
  const [view, setView] = useState<ViewMode>(defaultView);
  const [compact, setCompact] = useState(false);

  const channelGroups = useMemo(() => groupVideosByChannel(videos, 3), [videos]);
  const actions = (
    <ResultsActions
      view={view}
      compact={compact}
      source={source}
      onChangeView={setView}
      onToggleCompact={() => setCompact((c) => !c)}
      onExportCsv={onExportCsv}
    />
  );

  if (view === "table") {
    return (
      <ResultsTable
        videos={videos}
        showRevenue={showRevenue}
        source={source}
        totalCount={totalCount}
        pageSize={pageSize}
        onExportCsv={onExportCsv}
        viewToggle={actions}
      />
    );
  }

  if (view === "feed") {
    return (
      <Panel>
        <PanelHeader
          title="Outlier Feed"
          sub={`${videos.length} of ${totalCount.toLocaleString()} videos · ${pageSize}/page`}
          actions={actions}
        />

        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {videos.map((video) => (
            <FeedVideoCard key={video.id} video={video} isMock={source === "mock"} />
          ))}
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Results"
        sub={`${channelGroups.length} channels · ${videos.length} of ${totalCount.toLocaleString()} videos`}
        actions={actions}
      />

      <div className="px-4 pb-4 space-y-3">
        {channelGroups.map((group) => (
          <ChannelGroupCard
            key={group.channelId}
            group={group}
            isMock={source === "mock"}
            compact={compact}
            showRevenue={showRevenue}
          />
        ))}
      </div>
    </Panel>
  );
}

function FeedVideoCard({ video, isMock }: { video: EnrichedVideo; isMock: boolean }) {
  const videoUrl = !isMock ? `https://youtube.com/watch?v=${video.id}` : undefined;
  const avg = Math.max(video.channelAvgViews, 1);
  const avgRatio = video.views / avg;
  const age = daysAgo(video.publishedAt);

  return (
    <article className="min-w-0 overflow-hidden rounded-md border border-neutral-800 bg-neutral-950/70">
      <a
        href={videoUrl ?? "#"}
        target={videoUrl ? "_blank" : undefined}
        rel={videoUrl ? "noopener noreferrer" : undefined}
        onClick={(event) => !videoUrl && event.preventDefault()}
        className="group block"
      >
        <div className="relative aspect-video overflow-hidden bg-neutral-900">
          {video.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.thumbnail}
              alt=""
              className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-neutral-700">
              No thumbnail
            </div>
          )}
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {formatDurationLabel(video.durationSeconds ?? 0)}
          </span>
        </div>
      </a>

      <div className="space-y-3 p-3">
        <a
          href={videoUrl ?? "#"}
          target={videoUrl ? "_blank" : undefined}
          rel={videoUrl ? "noopener noreferrer" : undefined}
          onClick={(event) => !videoUrl && event.preventDefault()}
          className="line-clamp-2 min-h-[2.6rem] text-sm font-semibold leading-snug text-neutral-100 transition-colors hover:text-red-300"
        >
          {video.title}
        </a>

        <div className="truncate text-xs text-neutral-500">{video.channelTitle}</div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Views</div>
            <div className="mt-0.5 font-mono font-semibold text-neutral-200">{fmt(video.views)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">Channel Avg</div>
            <div className="mt-0.5 font-mono font-semibold text-neutral-200">{fmt(avg)}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <OutlierBadge score={video.outlierScore} />
          <span className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-red-300">
            {avgRatio.toFixed(avgRatio >= 10 ? 1 : 2)}x avg
          </span>
          <span className="text-xs text-neutral-500">{age}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
          {videoUrl && (
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-neutral-700 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:border-red-500 hover:text-neutral-100"
            >
              YouTube
            </a>
          )}
          <Link
            href={!isMock ? `/channel/${video.channelId}` : "#"}
            onClick={(event) => isMock && event.preventDefault()}
            className="rounded border border-neutral-700 bg-white px-2.5 py-1.5 text-xs font-bold text-neutral-950 transition-colors hover:bg-neutral-200"
          >
            Channel Report
          </Link>
        </div>
      </div>
    </article>
  );
}

function ResultsActions({
  view,
  compact,
  source,
  onChangeView,
  onToggleCompact,
  onExportCsv,
}: {
  view: ViewMode;
  compact: boolean;
  source: string | null;
  onChangeView: (v: ViewMode) => void;
  onToggleCompact: () => void;
  onExportCsv: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ViewToggle
        view={view}
        compact={compact}
        onChangeView={onChangeView}
        onToggleCompact={onToggleCompact}
      />
      {source === "mock" && (
        <span className="rounded border border-amber-900 bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-300">
          Mock data
        </span>
      )}
      {source === "database" && (
        <span className="rounded border border-sky-900 bg-sky-950/30 px-2 py-0.5 text-[10px] font-medium text-sky-300">
          Database
        </span>
      )}
      {source === "database_youtube_refresh" && (
        <span className="rounded border border-emerald-900 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
          Refreshed
        </span>
      )}
      <button
        type="button"
        onClick={onExportCsv}
        className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors"
      >
        CSV
      </button>
    </div>
  );
}

function ViewToggle({
  view,
  compact,
  onChangeView,
  onToggleCompact,
}: {
  view: ViewMode;
  compact: boolean;
  onChangeView: (v: ViewMode) => void;
  onToggleCompact: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex rounded border border-neutral-700 overflow-hidden text-[11px]">
        <button
          type="button"
          onClick={() => onChangeView("feed")}
          className={`px-2.5 py-1 transition-colors ${
            view === "feed"
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Feed
        </button>
        <button
          type="button"
          onClick={() => onChangeView("channels")}
          className={`border-l border-neutral-700 px-2.5 py-1 transition-colors ${
            view === "channels"
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Channels
        </button>
        <button
          type="button"
          onClick={() => onChangeView("table")}
          className={`px-2.5 py-1 border-l border-neutral-700 transition-colors ${
            view === "table"
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Table
        </button>
      </div>
      {view === "channels" && (
        <button
          type="button"
          onClick={onToggleCompact}
          title={compact ? "Comfortable view" : "Compact view"}
          className={`rounded border px-2 py-1 text-[11px] transition-colors ${
            compact
              ? "border-neutral-600 bg-neutral-800 text-neutral-200"
              : "border-neutral-700 text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {compact ? "⊞" : "⊟"}
        </button>
      )}
    </div>
  );
}
