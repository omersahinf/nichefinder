// app/components/FilterSidebar.tsx
"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { DURATION_PRESETS } from "@/lib/duration";

type Mode = "preset" | "custom";
type VideoFormat = "all" | "standard" | "shorts";
type SortKey = "outlier" | "views" | "date" | "subs";

interface Filters {
  subsMode: Mode;
  minSubs: number;
  maxSubs: number;
  dateMode: Mode;
  days: number;
  publishedAfter: string;
  publishedBefore: string;
  durationMode: Mode;
  durationPreset: string;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  minViews: number;
  minOutlier: number;
  format: VideoFormat;
  sort: SortKey;
}

const MAX_SUBS = 10_000_000;

const SUB_PRESETS = [
  { label: "All",       min: 0,         max: MAX_SUBS   },
  { label: "<1K",       min: 0,         max: 1_000      },
  { label: "1K–10K",    min: 1_000,     max: 10_000     },
  { label: "10K–100K",  min: 10_000,    max: 100_000    },
  { label: "100K–1M",   min: 100_000,   max: 1_000_000  },
  { label: "1M+",       min: 1_000_000, max: MAX_SUBS   },
];

const DATE_OPTIONS = [
  { label: "All time", value: 0   },
  { label: "3d",       value: 3   },
  { label: "7d",       value: 7   },
  { label: "30d",      value: 30  },
  { label: "90d",      value: 90  },
  { label: "1y",       value: 365 },
];

const FORMAT_OPTIONS: { label: string; value: VideoFormat }[] = [
  { label: "All",       value: "all"      },
  { label: "Standard",  value: "standard" },
  { label: "Shorts",    value: "shorts"   },
];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-red-600 text-white"
          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500 mb-2">
      {children}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  setFilters: Dispatch<SetStateAction<Filters>>;
  showRevenue: boolean;
  setShowRevenue: Dispatch<SetStateAction<boolean>>;
}

export function FilterSidebar({ open, onClose, filters, setFilters, showRevenue, setShowRevenue }: Props) {
  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col border-l border-neutral-800 bg-neutral-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <span className="text-sm font-semibold text-neutral-100">Filters</span>
          <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200 transition-colors">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Subscriber range */}
          <div>
            <SectionLabel>Subscriber Range</SectionLabel>
            <div className="flex flex-wrap gap-1.5">
              {SUB_PRESETS.map(p => (
                <Pill
                  key={p.label}
                  active={filters.subsMode === "preset" && filters.minSubs === p.min && filters.maxSubs === p.max}
                  onClick={() => setFilters(f => ({ ...f, subsMode: "preset", minSubs: p.min, maxSubs: p.max }))}
                >
                  {p.label}
                </Pill>
              ))}
            </div>
            {filters.subsMode === "custom" && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Min</span>
                  <input
                    type="number" min={0} placeholder="0"
                    value={filters.minSubs || ""}
                    onChange={e => setFilters(f => ({ ...f, subsMode: "custom", minSubs: Number(e.target.value) || 0 }))}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs font-mono text-neutral-100 outline-none focus:border-neutral-600"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Max</span>
                  <input
                    type="number" min={0} placeholder="10000000"
                    value={filters.maxSubs < MAX_SUBS ? filters.maxSubs : ""}
                    onChange={e => setFilters(f => ({ ...f, subsMode: "custom", maxSubs: Number(e.target.value) || MAX_SUBS }))}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs font-mono text-neutral-100 outline-none focus:border-neutral-600"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, subsMode: f.subsMode === "preset" ? "custom" : "preset" }))}
              className="mt-2 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {filters.subsMode === "preset" ? "Custom range →" : "Use presets →"}
            </button>
          </div>

          {/* Date range */}
          <div>
            <SectionLabel>Date Range</SectionLabel>
            {filters.dateMode === "preset" && (
              <div className="flex flex-wrap gap-1.5">
                {DATE_OPTIONS.map(opt => (
                  <Pill
                    key={opt.value}
                    active={filters.days === opt.value}
                    onClick={() => setFilters(f => ({ ...f, dateMode: "preset", days: opt.value }))}
                  >
                    {opt.label}
                  </Pill>
                ))}
              </div>
            )}
            {filters.dateMode === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">From</span>
                  <input
                    type="date"
                    value={filters.publishedAfter}
                    onChange={e => setFilters(f => ({ ...f, dateMode: "custom", publishedAfter: e.target.value }))}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-neutral-600"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">To</span>
                  <input
                    type="date"
                    value={filters.publishedBefore}
                    onChange={e => setFilters(f => ({ ...f, dateMode: "custom", publishedBefore: e.target.value }))}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-100 outline-none focus:border-neutral-600"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, dateMode: f.dateMode === "preset" ? "custom" : "preset" }))}
              className="mt-2 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {filters.dateMode === "preset" ? "Custom dates →" : "Use presets →"}
            </button>
          </div>

          {/* Format */}
          <div>
            <SectionLabel>Video Format</SectionLabel>
            <div className="flex gap-1.5">
              {FORMAT_OPTIONS.map(opt => (
                <Pill
                  key={opt.value}
                  active={filters.format === opt.value}
                  onClick={() => setFilters(f => ({ ...f, format: opt.value }))}
                >
                  {opt.label}
                </Pill>
              ))}
            </div>
          </div>

          {/* Duration */}
          <div>
            <SectionLabel>Duration</SectionLabel>
            {filters.durationMode === "preset" && (
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((preset) => (
                  <Pill
                    key={preset.label}
                    active={filters.durationPreset === preset.label}
                    onClick={() => setFilters(f => ({
                      ...f,
                      durationMode: "preset",
                      durationPreset: preset.label,
                    }))}
                  >
                    {preset.label}
                  </Pill>
                ))}
              </div>
            )}
            {filters.durationMode === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Min minutes</span>
                  <input
                    type="number" min={0} placeholder="0"
                    value={filters.minDurationMinutes || ""}
                    onChange={e => setFilters(f => ({ ...f, durationMode: "custom", minDurationMinutes: Number(e.target.value) || 0 }))}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs font-mono text-neutral-100 outline-none focus:border-neutral-600"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Max minutes</span>
                  <input
                    type="number" min={0} placeholder="Any"
                    value={filters.maxDurationMinutes || ""}
                    onChange={e => setFilters(f => ({ ...f, durationMode: "custom", maxDurationMinutes: Number(e.target.value) || 0 }))}
                    className="w-full rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs font-mono text-neutral-100 outline-none focus:border-neutral-600"
                  />
                </label>
              </div>
            )}
            <button
              type="button"
              onClick={() => setFilters(f => ({ ...f, durationMode: f.durationMode === "preset" ? "custom" : "preset" }))}
              className="mt-2 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {filters.durationMode === "preset" ? "Custom duration →" : "Use presets →"}
            </button>
          </div>

          {/* Numeric filters */}
          <div className="space-y-3">
            <SectionLabel>Thresholds</SectionLabel>
            <label className="block space-y-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Min Views</span>
              <input
                type="number" min={0} step={1000} placeholder="0"
                value={filters.minViews || ""}
                onChange={e => setFilters(f => ({ ...f, minViews: Number(e.target.value) || 0 }))}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-mono text-neutral-100 outline-none focus:border-neutral-600"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">Min Outlier Score</span>
              <input
                type="number" min={0} step={0.5} placeholder="0"
                value={filters.minOutlier || ""}
                onChange={e => setFilters(f => ({ ...f, minOutlier: Number(e.target.value) || 0 }))}
                className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-mono text-neutral-100 outline-none focus:border-neutral-600"
              />
            </label>
          </div>

          {/* Sort */}
          <div>
            <SectionLabel>Sort By</SectionLabel>
            <select
              value={filters.sort}
              onChange={e => setFilters(f => ({ ...f, sort: e.target.value as SortKey }))}
              className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-neutral-100 outline-none focus:border-neutral-600"
            >
              <option value="outlier">Outlier score</option>
              <option value="views">Views</option>
              <option value="date">Newest first</option>
              <option value="subs">Subscribers</option>
            </select>
          </div>

          {/* Revenue toggle */}
          <div>
            <SectionLabel>Display</SectionLabel>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showRevenue}
                onChange={e => setShowRevenue(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-red-600"
              />
              <span className="text-xs text-neutral-300">Show revenue estimates</span>
            </label>
          </div>
        </div>

        <div className="border-t border-neutral-800 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded bg-red-600 py-2.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </aside>
    </>
  );
}
