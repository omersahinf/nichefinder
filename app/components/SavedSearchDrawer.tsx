"use client";

import type { SavedSearch } from "@/lib/saved-searches";

interface Props {
  open: boolean;
  onClose: () => void;
  savedSearches: SavedSearch[];
  onOpen: (saved: SavedSearch) => void;
  onDelete: (id: string) => void;
}

export function SavedSearchDrawer({ open, onClose, savedSearches, onOpen, onDelete }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-neutral-800 bg-neutral-950 shadow-2xl">
      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <span className="text-sm font-semibold">Saved Searches</span>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-200">✕</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {savedSearches.length === 0 ? (
          <div className="rounded border border-dashed border-neutral-800 px-3 py-8 text-center text-xs text-neutral-500">
            No saved searches yet.
          </div>
        ) : (
          savedSearches.map((saved) => (
            <div key={saved.id} className="group rounded border border-neutral-800 bg-neutral-900/40 p-3">
              <button type="button" onClick={() => onOpen(saved)} className="block w-full text-left">
                <span className="block truncate text-xs font-medium text-neutral-100 group-hover:text-red-300 transition-colors">
                  {saved.label}
                </span>
                <span className="mt-1 block truncate text-[11px] text-neutral-500">
                  {saved.keyword || "Browse mode"}
                </span>
              </button>
              <button type="button" onClick={() => onDelete(saved.id)}
                className="mt-2 text-[11px] font-medium text-neutral-500 hover:text-red-300 transition-colors">
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
