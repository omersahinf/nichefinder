"use client";

import { useState, useMemo } from "react";
import type { EnrichedVideo } from "@/lib/search-types";
import { formatDurationLabel } from "@/lib/duration";
import { buildOutlierExplanation } from "@/lib/outlier-reasons";
import { TrendSparkline } from "@/app/components/charts";
import { Panel, PanelHeader, OutlierBadge, Badge } from "./ui";

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const daysAgo = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "today";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

type SortKey = "server" | "outlier" | "views" | "date" | "subs" | "revenue";

interface Props {
  videos: EnrichedVideo[];
  showRevenue: boolean;
  source: string | null;
  totalCount: number;
  pageSize: number;
  onExportCsv: () => void;
  viewToggle?: React.ReactNode;
}

function SortButton({
  sortKey,
  sortDir,
  column,
  label,
  onSort,
}: {
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  column: Exclude<SortKey, "server">;
  label: string;
  onSort: (key: Exclude<SortKey, "server">) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={`flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-widest transition-colors ${
        sortKey === column ? "text-neutral-200" : "text-neutral-500 hover:text-neutral-300"
      }`}
    >
      {label}
      {sortKey === column && <span className="ml-0.5 text-neutral-400">{sortDir === "desc" ? "↓" : "↑"}</span>}
    </button>
  );
}

interface VideoTableRowProps {
  video: EnrichedVideo;
  index: number;
  showRevenue: boolean;
  source: string | null;
  hovered: boolean;
  onHover: (id: string | null) => void;
  videoBadges: (v: EnrichedVideo) => string[];
}

function VideoTableRow({ video: v, index: i, showRevenue, source, hovered, onHover, videoBadges }: VideoTableRowProps) {
  const [expanded, setExpanded] = useState(false);
  const badges = videoBadges(v);
  const videoUrl = source !== "mock" ? `https://youtube.com/watch?v=${v.id}` : undefined;
  const explanation = buildOutlierExplanation(v);

  const colSpan = 8 + (showRevenue ? 1 : 0) + 3;

  return (
    <>
      <tr
        onMouseEnter={() => onHover(v.id)}
        onMouseLeave={() => onHover(null)}
        className={`border-b border-neutral-800/60 transition-colors ${
          hovered ? "bg-neutral-800/30" : i % 2 === 0 ? "bg-transparent" : "bg-neutral-900/20"
        }`}
      >
        {/* Thumbnail + title */}
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-3">
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => !videoUrl && e.preventDefault()}
              className="relative h-10 w-16 flex-shrink-0 overflow-hidden rounded bg-neutral-800 block"
            >
              {v.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
              )}
              <span className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-0.5 text-[9px] font-mono text-white">
                {formatDurationLabel(v.durationSeconds ?? 0)}
              </span>
            </a>
            <div className="min-w-0">
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => !videoUrl && e.preventDefault()}
                className="line-clamp-2 max-w-xs text-xs font-medium text-neutral-100 leading-snug hover:text-red-300 transition-colors"
              >
                {v.title}
              </a>
              <div className="mt-0.5 text-[11px] text-neutral-500 truncate max-w-xs">{v.channelTitle}</div>
              {badges.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {badges.slice(0, 2).map(b => <Badge key={b} label={b} />)}
                </div>
              )}
            </div>
          </div>
        </td>
        {/* Subs */}
        <td className="px-3 py-2.5 text-right font-mono text-xs text-neutral-400">
          {fmt(v.channelSubs)}
        </td>
        {/* Views */}
        <td className="px-3 py-2.5 text-right font-mono text-xs font-semibold text-neutral-200">
          {fmt(v.views)}
        </td>
        {/* Outlier */}
        <td className="px-3 py-2.5 text-right">
          <OutlierBadge score={v.outlierScore} />
        </td>
        {/* Duration */}
        <td className="hidden px-3 py-2.5 text-left font-mono text-xs text-neutral-500 lg:table-cell">
          {formatDurationLabel(v.durationSeconds ?? 0)}
        </td>
        {/* Published */}
        <td className="hidden px-3 py-2.5 text-left text-xs text-neutral-500 lg:table-cell">
          {daysAgo(v.publishedAt)}
        </td>
        {/* Category */}
        <td className="hidden px-3 py-2.5 xl:table-cell">
          {v.category && (
            <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
              {v.category}
            </span>
          )}
        </td>
        {/* Revenue */}
        {showRevenue && (
          <td className="px-3 py-2.5 text-right font-mono text-xs text-amber-400">
            {typeof v.estimatedRevenueUsd === "number"
              ? fmtUsd(Math.round(v.estimatedRevenueUsd))
              : "—"}
          </td>
        )}
        {/* Reason */}
        <td className="hidden px-3 py-2.5 xl:table-cell max-w-[200px]">
          <span className="line-clamp-2 text-[11px] text-neutral-500 leading-snug">
            {v.outlierReason}
          </span>
        </td>
        {/* Trend sparkline */}
        <td className="hidden px-3 py-2.5 text-center lg:table-cell">
          {v.channelTrend && <TrendSparkline trend={v.channelTrend} />}
        </td>
        {/* Expand toggle */}
        <td className="px-2 py-2.5 text-right">
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className={`text-xs transition-colors ${hovered ? "text-neutral-300" : "text-neutral-600"}`}
            title={expanded ? "Collapse explanation" : "Expand explanation"}
          >
            {expanded ? "▲" : "▼"}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-neutral-800/40 bg-neutral-900/40">
          <td colSpan={colSpan} className="px-4 py-2.5">
            <div className="flex flex-wrap items-start gap-3">
              <span className="text-[11px] font-medium text-neutral-300">{explanation.summary}</span>
              {explanation.factors.map((f, idx) => (
                <span
                  key={idx}
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
          </td>
        </tr>
      )}
    </>
  );
}

export function ResultsTable({ videos, showRevenue, source, totalCount, pageSize, onExportCsv, viewToggle }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("server");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [hovered, setHovered] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const copy = [...videos];
    if (sortKey === "server") return copy;
    copy.sort((a, b) => {
      let av: number, bv: number;
      switch (sortKey) {
        case "outlier": av = a.outlierScore;      bv = b.outlierScore;      break;
        case "views":   av = a.views;             bv = b.views;             break;
        case "subs":    av = a.channelSubs;       bv = b.channelSubs;       break;
        case "revenue": av = a.estimatedRevenueUsd ?? 0; bv = b.estimatedRevenueUsd ?? 0; break;
        case "date":    av = new Date(a.publishedAt).getTime(); bv = new Date(b.publishedAt).getTime(); break;
        default:        av = a.outlierScore;      bv = b.outlierScore;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [videos, sortKey, sortDir]);

  const toggleSort = (key: Exclude<SortKey, "server">) => {
    if (sortKey === key) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const videoBadges = (v: EnrichedVideo): string[] => {
    const badges: string[] = [];
    if (v.outlierScore >= 8 && v.channelSubs < 50_000) badges.push("Small channel winner");
    if (v.outlierScore >= 12) badges.push("Breakout format");
    if (typeof v.estimatedRevenueUsd === "number" && v.estimatedRevenueUsd > 0) {
      const rpm = (v.estimatedRevenueUsd / (v.views / 1000));
      if (rpm >= 8) badges.push("High RPM");
    }
    return badges;
  };

  return (
    <Panel>
      <PanelHeader
        title="Results"
        sub={`${videos.length} of ${totalCount.toLocaleString()} videos · ${pageSize}/page`}
        actions={
          <div className="flex items-center gap-2">
            {viewToggle}
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-950/40">
              <th className="px-4 py-2.5 text-left"><SortButton sortKey={sortKey} sortDir={sortDir} column="outlier" label="Video" onSort={toggleSort} /></th>
              <th className="px-3 py-2.5 text-right"><SortButton sortKey={sortKey} sortDir={sortDir} column="subs" label="Subs" onSort={toggleSort} /></th>
              <th className="px-3 py-2.5 text-right"><SortButton sortKey={sortKey} sortDir={sortDir} column="views" label="Views" onSort={toggleSort} /></th>
              <th className="px-3 py-2.5 text-right">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Outlier</span>
              </th>
              <th className="hidden px-3 py-2.5 text-left lg:table-cell">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Duration</span>
              </th>
              <th className="hidden px-3 py-2.5 text-left lg:table-cell">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Published</span>
              </th>
              <th className="hidden px-3 py-2.5 text-left xl:table-cell">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Category</span>
              </th>
              {showRevenue && (
                <th className="px-3 py-2.5 text-right"><SortButton sortKey={sortKey} sortDir={sortDir} column="revenue" label="Revenue" onSort={toggleSort} /></th>
              )}
              <th className="hidden px-3 py-2.5 text-left xl:table-cell">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Reason</span>
              </th>
              <th className="hidden px-3 py-2.5 text-center lg:table-cell">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Trend</span>
              </th>
              <th className="w-8 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((v, i) => (
              <VideoTableRow
                key={v.id}
                video={v}
                index={i}
                showRevenue={showRevenue}
                source={source}
                hovered={hovered === v.id}
                onHover={setHovered}
                videoBadges={videoBadges}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
