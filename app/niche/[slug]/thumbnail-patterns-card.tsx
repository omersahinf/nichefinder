"use client";

import { useEffect, useState } from "react";
import type { EnrichedVideo } from "@/lib/search-types";
import {
  THUMBNAIL_LABEL_OPTIONS,
  type ThumbnailLabel,
  type ThumbnailPattern,
  type ThumbnailPatternSummary,
} from "@/lib/thumbnail-patterns";

interface ThumbnailPatternsResponse {
  patterns?: ThumbnailPattern[];
  summary?: ThumbnailPatternSummary;
  error?: string;
}

interface VideoWithPattern {
  video: EnrichedVideo;
  pattern: ThumbnailPattern | null;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function LabelCheckbox({
  label,
  checked,
  onChange,
}: {
  label: ThumbnailLabel;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1 rounded border border-neutral-800 bg-neutral-950/50 px-2 py-1 text-xs cursor-pointer hover:border-neutral-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 rounded border-neutral-600 bg-neutral-900 accent-red-500"
      />
      <span className="text-neutral-300">{label}</span>
    </label>
  );
}

function ThumbnailItem({
  item,
  isAdmin,
  onSave,
}: {
  item: VideoWithPattern;
  isAdmin: boolean;
  onSave: (videoId: string, labels: ThumbnailLabel[], notes: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [labels, setLabels] = useState<ThumbnailLabel[]>(item.pattern?.labels ?? []);
  const [notes, setNotes] = useState<string>(item.pattern?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      await onSave(item.video.id, labels, notes.trim() || null);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleLabel = (label: ThumbnailLabel, checked: boolean): void => {
    if (checked) {
      setLabels((prev) => [...prev, label]);
    } else {
      setLabels((prev) => prev.filter((l) => l !== label));
    }
  };

  return (
    <article className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
      <a
        href={`https://youtube.com/watch?v=${item.video.id}`}
        target="_blank"
        rel="noreferrer"
        className="block hover:opacity-80"
      >
        {item.video.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.video.thumbnail}
            alt=""
            className="h-32 w-full rounded object-cover"
            loading="lazy"
          />
        )}
      </a>

      <a
        href={`https://youtube.com/watch?v=${item.video.id}`}
        target="_blank"
        rel="noreferrer"
        className="mt-2 line-clamp-2 text-sm font-medium leading-snug hover:text-red-400"
      >
        {item.video.title}
      </a>

      <div className="mt-1 truncate text-xs text-neutral-500">{item.video.channelTitle}</div>

      <div className="mt-2 flex items-center gap-2">
        <span className="rounded border border-neutral-800 bg-neutral-950/60 px-2 py-1 font-mono text-xs text-red-300">
          {item.video.outlierScore.toFixed(1)}x
        </span>
        <span className="font-mono text-xs text-neutral-400">{fmt(item.video.views)} views</span>
      </div>

      {(item.pattern?.labels?.length ?? 0) > 0 && !editing && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.pattern!.labels.map((label) => (
            <span
              key={label}
              className="rounded border border-neutral-700 bg-neutral-900/60 px-1.5 py-0.5 text-xs text-neutral-300"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {isAdmin && (
        <div className="mt-3">
          {editing ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {THUMBNAIL_LABEL_OPTIONS.map((label) => (
                  <LabelCheckbox
                    key={label}
                    label={label}
                    checked={labels.includes(label)}
                    onChange={(checked) => toggleLabel(label, checked)}
                  />
                ))}
              </div>

              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="w-full rounded border border-neutral-800 bg-neutral-950 px-2 py-1 text-xs text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-700 focus:outline-none"
              />

              {error && <div className="text-xs text-red-400">{error}</div>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setLabels(item.pattern?.labels ?? []);
                    setNotes(item.pattern?.notes ?? "");
                    setError(null);
                  }}
                  disabled={saving}
                  className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:border-neutral-600 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
            >
              {item.pattern ? "Edit labels" : "Add labels"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default function ThumbnailPatternsCard({
  keyword,
  videos,
  isAdmin,
}: {
  keyword: string;
  videos: EnrichedVideo[];
  isAdmin: boolean;
}) {
  const [patterns, setPatterns] = useState<ThumbnailPattern[]>([]);
  const [summary, setSummary] = useState<ThumbnailPatternSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topVideos = [...videos].sort((a, b) => b.outlierScore - a.outlierScore).slice(0, 20);

  const videoPatternMap = new Map(patterns.map((p) => [p.videoId, p]));
  const items: VideoWithPattern[] = topVideos.map((video) => ({
    video,
    pattern: videoPatternMap.get(video.id) ?? null,
  }));

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/thumbnail-patterns?q=${encodeURIComponent(keyword)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as ThumbnailPatternsResponse;
        if (cancelled) return;

        if (!res.ok || data.error) {
          setError(data.error ?? "Failed to load patterns");
          return;
        }
        setPatterns(data.patterns ?? []);
        setSummary(data.summary ?? null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load patterns");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [keyword]);

  const savePattern = async (
    videoId: string,
    labels: ThumbnailLabel[],
    notes: string | null,
  ): Promise<void> => {
    const res = await fetch("/api/thumbnail-patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword, videoId, labels, notes }),
    });

    const data = (await res.json().catch(() => ({}))) as { pattern?: ThumbnailPattern; error?: string };

    if (!res.ok || data.error) {
      throw new Error(data.error ?? "Failed to save");
    }

    if (data.pattern) {
      setPatterns((prev) => {
        const existing = prev.find((p) => p.videoId === videoId);
        if (existing) {
          return prev.map((p) => (p.videoId === videoId ? data.pattern! : p));
        }
        return [...prev, data.pattern!];
      });
      
      setSummary((prev) => {
        if (!prev) return prev;
        const newPatterns = patterns.some(p => p.videoId === videoId) 
          ? patterns 
          : [...patterns, data.pattern!];
        const labeled = newPatterns.filter((p) => p.labels.length > 0).length;
        const labelCounts: Record<ThumbnailLabel, number> = {} as Record<ThumbnailLabel, number>;
        for (const label of THUMBNAIL_LABEL_OPTIONS) {
          labelCounts[label] = 0;
        }
        for (const p of newPatterns) {
          for (const label of p.labels) {
            if (labelCounts[label] !== undefined) {
              labelCounts[label]++;
            }
          }
        }
        const topLabels = Object.entries(labelCounts)
          .filter(([, count]) => count > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([label]) => label as ThumbnailLabel)
          .slice(0, 5);
        return { total: newPatterns.length, labeled, labelCounts, topLabels };
      });
    }
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-5 lg:col-span-2">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Thumbnail Patterns</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Top 20 outlier thumbnails in this niche. Labels are manually curated by admins.
          </p>
        </div>

        {summary && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded border border-neutral-700 bg-neutral-950/60 px-2 py-1 text-neutral-400">
              {summary.labeled} / {summary.total} labeled
            </span>
            {summary.topLabels.map((label) => (
              <span
                key={label}
                className="rounded border border-neutral-700 bg-neutral-900/60 px-2 py-1 text-neutral-300"
              >
                {label} ({summary.labelCounts[label]})
              </span>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="mt-5 grid gap-3 md:grid-cols-4 lg:grid-cols-5">
          {topVideos.slice(0, 8).map((video) => (
            <div key={video.id} className="rounded border border-neutral-800 bg-neutral-950/50 p-3">
              <div className="h-32 animate-pulse rounded bg-neutral-800/80" />
              <div className="mt-2 h-4 animate-pulse rounded bg-neutral-800/80 w-3/4" />
              <div className="mt-1 h-3 animate-pulse rounded bg-neutral-800/80 w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="mt-5 rounded-lg border border-neutral-800 bg-neutral-950/50 p-4 text-sm text-neutral-300">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-neutral-800 p-4 text-sm text-neutral-400">
          No outlier videos available for thumbnail analysis.
        </div>
      ) : summary?.labeled === 0 && !isAdmin ? (
        <>
          <div className="mt-5 rounded-lg border border-dashed border-neutral-800 p-4 text-sm text-neutral-400">
            No curated thumbnail labels yet.
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4 lg:grid-cols-5">
            {items.map((item) => (
              <ThumbnailItem
                key={item.video.id}
                item={item}
                isAdmin={isAdmin}
                onSave={savePattern}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <ThumbnailItem
              key={item.video.id}
              item={item}
              isAdmin={isAdmin}
              onSave={savePattern}
            />
          ))}
        </div>
      )}

      {!loading && !error && isAdmin && (
        <div className="mt-4 text-xs text-neutral-500">
          As admin, you can add/edit thumbnail labels for each video. Labels are stored in the
          database and visible to all users.
        </div>
      )}
    </section>
  );
}