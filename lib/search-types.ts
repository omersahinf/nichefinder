import type { ChannelTrend } from "./trend";

export type SearchSource = "youtube" | "mock" | "cache";

export interface EnrichedVideo {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  description: string;
  publishedAt: string;
  thumbnail: string;
  tags?: string[];
  views: number;
  likes: number;
  comments: number;
  duration: string;
  durationSeconds?: number;
  channelSubs: number;
  channelAvgViews: number;
  channelTotalViews?: number;
  channelVideoCount?: number;
  channelCreatedAt?: string;
  channelCountry?: string;
  channelThumbnail?: string;
  outlierScore: number;
  outlierReason: string;
  channelTrend?: ChannelTrend | null;
  category?: string;
  rpmUsd?: number;
  estimatedRevenueUsd?: number;
  isMonetized?: boolean;
  isShort?: boolean;
}

export interface SearchAndEnrichResult {
  results: EnrichedVideo[];
  source: SearchSource;
  fallbackReason?: string;
  cacheHit?: boolean;
  quotaUnits?: number;
  fetchedAt?: string;
}

export interface QuotaUsage {
  configured: boolean;
  used: number;
  limit: number;
  remaining: number;
  guardAt: number;
}
