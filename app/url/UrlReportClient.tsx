"use client";

import { useState, useTransition } from "react";
import type { NicheDecision } from "@/lib/niche-decision";
import type { SaturationReport } from "@/lib/saturation";
import { formatDurationLabel } from "@/lib/duration";

const fmt = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const VERDICT_COLORS = {
  Enter: "text-green-300 border-green-500/30 bg-green-500/10",
  Test: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  Avoid: "text-red-300 border-red-500/30 bg-red-500/10",
};

interface VideoInfo {
  id: string;
  title: string;
  views: number;
  channelId: string;
  publishedAt: string;
  outlierScore: number;
  thumbnailUrl?: string;
  durationSeconds?: number;
}

interface ChannelInfo {
  id: string;
  title: string;
  subs: number;
  thumbnailUrl?: string;
  category?: string;
  createdAt?: string;
}

interface SimilarChannel {
  channelId: string;
  channelTitle: string;
  subs: number;
}

interface ReportData {
  video: VideoInfo;
  channel: ChannelInfo | null;
  nicheKeyword: string;
  saturation: SaturationReport | null;
  decision: NicheDecision | null;
  similarChannels: SimilarChannel[];
  competitorChannelIds: string[];
}

function isYouTubeVideoUrl(input: string): boolean {
  return /youtube\.com\/watch\?v=|youtu\.be\//.test(input);
}

export function UrlReportClient() {
  const [url, setUrl] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchReport = () => {
    if (!url.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/video-report?url=${encodeURIComponent(url.trim())}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Unknown error");
        setReport(null);
      } else {
        setReport(json as ReportData);
      }
    });
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-neutral-100">Video URL Report</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Paste a YouTube video URL to get saturation, outlier score, similar channels, and niche verdict.
          </p>
        </div>

        {/* Input */}
        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchReport()}
            placeholder="https://youtube.com/watch?v=..."
            className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-500 transition-colors"
          />
          <button
            type="button"
            onClick={fetchReport}
            disabled={isPending || !isYouTubeVideoUrl(url)}
            className="rounded border border-neutral-600 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPending ? "Loading…" : "Analyze"}
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {report && (
          <div className="space-y-4">
            {/* Video card */}
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 flex gap-4">
              {report.video.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={report.video.thumbnailUrl}
                  alt=""
                  className="h-20 w-36 flex-shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={`https://youtube.com/watch?v=${report.video.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-neutral-100 hover:text-red-300 transition-colors line-clamp-2"
                >
                  {report.video.title}
                </a>
                <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-neutral-500">
                  <span>{fmt(report.video.views)} views</span>
                  {report.video.durationSeconds != null && (
                    <span>{formatDurationLabel(report.video.durationSeconds)}</span>
                  )}
                  <span>
                    {new Date(report.video.publishedAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="rounded border border-sky-700/40 bg-sky-900/20 px-1.5 py-0.5 text-[11px] font-semibold text-sky-300">
                    {report.video.outlierScore.toFixed(1)}× outlier
                  </span>
                </div>
              </div>
            </div>

            {/* Channel + Niche verdict */}
            <div className="grid grid-cols-2 gap-4">
              {report.channel && (
                <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                  <div className="text-[10px] uppercase tracking-wide text-neutral-600 mb-2">Channel</div>
                  <div className="flex items-center gap-2.5">
                    {report.channel.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={report.channel.thumbnailUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                      />
                    )}
                    <div>
                      <a
                        href={`https://youtube.com/channel/${report.channel.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-neutral-100 hover:text-red-300 transition-colors"
                      >
                        {report.channel.title}
                      </a>
                      <div className="text-[11px] text-neutral-500">
                        {fmt(report.channel.subs)} subs
                        {report.channel.category && ` · ${report.channel.category}`}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {report.decision && (
                <div
                  className={`rounded-lg border p-4 ${
                    VERDICT_COLORS[report.decision.verdict]
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-wide opacity-60 mb-1.5">
                    Niche Verdict{report.nicheKeyword ? ` · ${report.nicheKeyword}` : ""}
                  </div>
                  <div className="text-lg font-bold">{report.decision.verdict}</div>
                  <div className="mt-1 text-xs font-mono opacity-80">
                    Score {report.decision.score} / 100
                  </div>
                  {report.decision.reasons.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {report.decision.reasons.map((r, i) => (
                        <li key={i} className="text-[11px] opacity-70">
                          · {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Saturation metrics */}
            {report.saturation && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                <div className="text-[10px] uppercase tracking-wide text-neutral-600 mb-3">
                  Niche Saturation
                </div>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Videos", value: report.saturation.totalVideos },
                    { label: "Channels", value: report.saturation.uniqueChannels },
                    { label: "Avg Outlier", value: `${(report.saturation.avgOutlierScore ?? 0).toFixed(1)}×` },
                    { label: "Small-ch Win", value: `${Math.round((report.saturation.smallOutlierRatio ?? 0) * 100)}%` },
                  ].map((m) => (
                    <div key={m.label}>
                      <div className="text-[10px] text-neutral-600 mb-0.5">{m.label}</div>
                      <div className="font-mono text-sm font-semibold text-neutral-100">{m.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Similar channels */}
            {report.similarChannels.length > 0 && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-4">
                <div className="text-[10px] uppercase tracking-wide text-neutral-600 mb-3">
                  Similar Channels
                </div>
                <div className="space-y-2">
                  {report.similarChannels.slice(0, 6).map((c) => (
                    <div key={c.channelId} className="flex items-center justify-between">
                      <a
                        href={`https://youtube.com/channel/${c.channelId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-neutral-300 hover:text-red-300 transition-colors"
                      >
                        {c.channelTitle}
                      </a>
                      <span className="font-mono text-xs text-neutral-500">{fmt(c.subs)} subs</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
