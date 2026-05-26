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
  totalVideosInNiche: number;
  topVideos: EnrichedVideo[];
}

export function groupVideosByChannel(videos: EnrichedVideo[], topN = 4): ChannelGroup[] {
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
      totalVideosInNiche: channelVideos.length,
      topVideos: sorted.slice(0, topN),
    });
  }

  return groups.sort((a, b) => b.bestOutlierScore - a.bestOutlierScore);
}
