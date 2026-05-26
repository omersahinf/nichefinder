"use client";

import { useState, useMemo } from "react";
import type { EnrichedVideo } from "@/lib/search-types";
import { groupVideosByChannel } from "@/lib/group-by-channel";
import { ChannelGroupCard } from "./ChannelGroupCard";
import { ResultsTable } from "./ResultsTable";
import { Panel, PanelHeader } from "./ui";

type ViewMode = "channels" | "videos";

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
  defaultView = "channels",
}: Props) {
  const [view, setView] = useState<ViewMode>(defaultView);
  const [compact, setCompact] = useState(false);

  const channelGroups = useMemo(() => groupVideosByChannel(videos, 4), [videos]);

  if (view === "videos") {
    return (
      <ResultsTable
        videos={videos}
        showRevenue={showRevenue}
        source={source}
        totalCount={totalCount}
        pageSize={pageSize}
        onExportCsv={onExportCsv}
        viewToggle={
          <ViewToggle
            view={view}
            compact={compact}
            onChangeView={setView}
            onToggleCompact={() => setCompact((c) => !c)}
          />
        }
      />
    );
  }

  return (
    <Panel>
      <PanelHeader
        title="Results"
        sub={`${channelGroups.length} channels · ${videos.length} of ${totalCount.toLocaleString()} videos`}
        actions={
          <div className="flex items-center gap-2">
            <ViewToggle
              view={view}
              compact={compact}
              onChangeView={setView}
              onToggleCompact={() => setCompact((c) => !c)}
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
        }
      />

      <div className="px-4 pb-4 space-y-3">
        {channelGroups.map((group) => (
          <ChannelGroupCard
            key={group.channelId}
            group={group}
            isMock={source === "mock"}
            compact={compact}
          />
        ))}
      </div>
    </Panel>
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
          onClick={() => onChangeView("channels")}
          className={`px-2.5 py-1 transition-colors ${
            view === "channels"
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Channels
        </button>
        <button
          type="button"
          onClick={() => onChangeView("videos")}
          className={`px-2.5 py-1 border-l border-neutral-700 transition-colors ${
            view === "videos"
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          Videos
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
