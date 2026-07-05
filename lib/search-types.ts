import type { ChannelTrend } from "./trend";
import type { ContentClass, ContentQualityReason } from "./content-quality";

export type SearchSource =
  | "database"
  | "database_youtube_refresh"
  | "youtube_refresh"
  | "mock";

export type StoredSearchSource = SearchSource | "youtube" | "cache";

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
  contentClass?: ContentClass;
  contentReasons?: ContentQualityReason[];
  contentScore?: number;
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

export type { ChannelGroup } from "./group-by-channel";
