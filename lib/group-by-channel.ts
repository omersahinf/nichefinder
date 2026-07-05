import type { EnrichedVideo } from "./search-types";

export interface ChannelGroup {
  channelId: string;
  channelTitle: string;
  channelSubs: number;
  channelAvgViews: number;
  channelTotalViews?: number;
  channelVideoCount?: number;
  channelCreatedAt?: string;
  channelCountry?: string;
  channelThumbnail?: string;
  avgOutlierScore: number;
  bestOutlierScore: number;
  typicalViews: number;
  totalVideosInNiche: number;
  nicheChips: string[];
  contentType: "Shorts" | "Long-Form" | "Mixed";
  activeSinceLabel: string;
  revenueRange?: { min: number; max: number };
  rpmRange?: { min: number; max: number };
  topVideos: EnrichedVideo[];
}

function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function activeSinceLabel(createdAt?: string): string {
  if (!createdAt) return "";
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) return "";
  const months = Math.max(1, Math.floor(ageMs / (30.4375 * 86_400_000)));
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `${years}+ year${years === 1 ? "" : "s"}`;
}

function contentType(videos: EnrichedVideo[]): ChannelGroup["contentType"] {
  const shortCount = videos.filter((video) => video.isShort || (video.durationSeconds ?? 61) <= 60).length;
  if (shortCount === 0) return "Long-Form";
  if (shortCount === videos.length) return "Shorts";
  return "Mixed";
}

function toTitleChip(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function nicheChips(videos: EnrichedVideo[], limit = 5): string[] {
  const counts = new Map<string, { label: string; count: number; category: boolean }>();

  for (const video of videos) {
    const candidates = [
      { value: video.category, category: true },
      ...(video.tags ?? []).slice(0, 8).map((tag) => ({ value: tag, category: false })),
    ];
    const seenInVideo = new Set<string>();

    for (const candidate of candidates) {
      const normalized = candidate.value?.trim().toLowerCase();
      if (!normalized || normalized.length < 3) continue;
      if (seenInVideo.has(normalized)) continue;
      seenInVideo.add(normalized);
      const existing = counts.get(normalized);
      counts.set(normalized, {
        label: existing?.label ?? toTitleChip(normalized),
        count: (existing?.count ?? 0) + 1,
        category: (existing?.category ?? false) || candidate.category,
      });
    }
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || Number(b.category) - Number(a.category) || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((chip) => chip.label);
}

function numericRange(values: Array<number | undefined>): { min: number; max: number } | undefined {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return undefined;
  return {
    min: Math.min(...numbers),
    max: Math.max(...numbers),
  };
}

export function groupVideosByChannel(videos: EnrichedVideo[], topN = 3): ChannelGroup[] {
  const channelMap = new Map<string, EnrichedVideo[]>();

  for (const video of videos) {
    const existing = channelMap.get(video.channelId) ?? [];
    existing.push(video);
    channelMap.set(video.channelId, existing);
  }

  const groups: ChannelGroup[] = [];

  for (const [channelId, channelVideos] of channelMap) {
    const sorted = [...channelVideos].sort((a, b) => b.outlierScore - a.outlierScore);
    const first = sorted[0];
    const avgOutlierScore =
      channelVideos.reduce((sum, v) => sum + v.outlierScore, 0) / channelVideos.length;
    const bestOutlierScore = sorted[0]?.outlierScore ?? 0;
    const views = channelVideos.map((video) => video.views);

    groups.push({
      channelId,
      channelTitle: first.channelTitle,
      channelSubs: first.channelSubs,
      channelAvgViews: first.channelAvgViews,
      channelTotalViews: first.channelTotalViews,
      channelVideoCount: first.channelVideoCount,
      channelCreatedAt: first.channelCreatedAt,
      channelCountry: first.channelCountry,
      channelThumbnail: first.channelThumbnail,
      avgOutlierScore,
      bestOutlierScore,
      typicalViews: median(views),
      totalVideosInNiche: channelVideos.length,
      nicheChips: nicheChips(channelVideos),
      contentType: contentType(channelVideos),
      activeSinceLabel: activeSinceLabel(first.channelCreatedAt),
      revenueRange: numericRange(channelVideos.map((video) => video.estimatedRevenueUsd)),
      rpmRange: numericRange(channelVideos.map((video) => video.rpmUsd)),
      topVideos: sorted.slice(0, topN),
    });
  }

  return groups.sort((a, b) => b.bestOutlierScore - a.bestOutlierScore);
}
