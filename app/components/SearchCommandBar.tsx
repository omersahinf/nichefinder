"use client";

import type { FormEvent, RefObject } from "react";
import type { Filters } from "@/lib/search-utils";

interface ActiveChip {
  key: string;
  label: string;
  clear: () => void;
}

interface Props {
  q: string;
  setQ: (q: string) => void;
  isUrl: boolean;
  loading: boolean;
  loadingMore: boolean;
  canForceRefresh: boolean;
  activeChips: ActiveChip[];
  searchInputRef: RefObject<HTMLInputElement>;
  onSubmit: (e: FormEvent) => void;
  onForceRefresh: () => void;
  onOpenFilters: () => void;
}

export function SearchCommandBar({
  q, setQ, isUrl, loading, loadingMore, canForceRefresh, activeChips,
  searchInputRef, onSubmit, onForceRefresh, onOpenFilters,
}: Props) {
  return (
    <div className="sticky top-12 z-30 border-b border-neutral-800/60 bg-neutral-950/90 backdrop-blur-sm">
      <div className="mx-auto max-w-screen-xl px-5 py-2.5">
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <div className={`relative flex flex-1 items-center overflow-hidden rounded-md border transition-colors ${
            isUrl ? "border-cyan-500/40 focus-within:border-cyan-400/60" : "border-neutral-700 focus-within:border-red-500/50"
          } bg-neutral-900`}>
            <div className="flex-shrink-0 pl-3 text-neutral-600">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M10.5 10.5L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <input
              ref={searchInputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search niche or paste YouTube URL…"
              className="flex-1 bg-transparent px-2.5 py-2.5 text-sm text-neutral-100 placeholder-neutral-600 outline-none font-sans"
            />
            {isUrl && (
              <span className="mr-2 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-400">
                URL
              </span>
            )}
          </div>

          <button type="button" onClick={onOpenFilters}
            className="flex items-center gap-1.5 rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs font-medium text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 2.5h10M3 6h6M5 9.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            Filters
            {activeChips.length > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white font-bold">
                {activeChips.length}
              </span>
            )}
          </button>

          <button type="submit" disabled={loading}
            className="rounded bg-red-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50 transition-colors">
            {loading ? "…" : isUrl ? "Analyze" : "Search"}
          </button>

          {canForceRefresh && (
            <button type="button" onClick={onForceRefresh} disabled={loading || loadingMore}
              className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-xs font-medium text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-50 transition-colors">
              ↻
            </button>
          )}
        </form>

        {activeChips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-2 pb-1">
            {activeChips.map((chip) => (
              <button key={chip.key} type="button" onClick={chip.clear}
                className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-0.5 text-[11px] text-neutral-300 hover:border-red-500 transition-colors">
                {chip.label}
                <span className="text-neutral-500">×</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
