import type { EnrichedVideo } from "./search-types";
import { getOutlierReason } from "./outlier-reasons";
import { parseIsoDurationToSeconds } from "./duration";

const DAY_MS = 86_400_000;

const CHANNEL_PATTERNS = [
  "{query} Lab",
  "{query} Atlas",
  "Quiet {query}",
  "{query} Blueprint",
  "{query} Signals",
  "{query} Daily",
  "Faceless {query}",
  "{query} Sprint",
  "{query} HQ",
  "{query} Deep Dive",
  "{query} Studio",
  "{query} Notes",
];

const VIDEO_PATTERNS = [
  "{query}: 7 angles nobody is covering",
  "This {query} format got unexpected reach",
  "A 10-minute faceless script system for {query}",
  "Small channel, big result: {query} workflow",
  "{query} niche map for 2026",
  "Why this {query} video broke out",
  "Low competition {query} angle breakdown",
  "{query} shorts vs long-form: quick test",
  "How I would start a {query} channel today",
  "{query} topic ideas with high outlier odds",
  "{query} thumbnail hooks that keep working",
  "What small {query} channels get right",
];

const CHANNEL_SUBS = [
  1_200, 3_400, 8_900, 14_000, 27_000, 61_000, 125_000, 280_000, 940_000, 6_400,
  18_000, 43_000,
];

const CHANNEL_AVG_VIEWS = [
  380, 940, 1_800, 3_400, 5_100, 8_600, 16_200, 29_000, 52_000, 1_250, 4_000, 7_400,
];

const OUTLIER_MULTIPLIERS = [11.4, 8.2, 6.4, 5.1, 3.8, 3.1, 2.5, 1.9, 1.5, 4.4, 2.8, 2.1];
const PUBLISHED_DAYS_AGO = [2, 4, 6, 8, 11, 14, 18, 23, 31, 37, 52, 74];

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "niche";

const titleCase = (value: string): string =>
  value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const fillPattern = (pattern: string, query: string): string => {
  const [prefix] = pattern.split("{query}");
  if (prefix?.trim() && query.toLowerCase().startsWith(prefix.trim().toLowerCase())) {
    return query;
  }

  return pattern.replaceAll("{query}", query);
};

const svgThumbnail = (query: string, index: number): string => {
  const initials = query
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#991b1b" />
          <stop offset="100%" stop-color="#111827" />
        </linearGradient>
      </defs>
      <rect width="320" height="180" fill="url(#g)" rx="18" />
      <circle cx="${56 + index * 6}" cy="40" r="20" fill="rgba(255,255,255,0.08)" />
      <text x="28" y="52" fill="#fca5a5" font-size="18" font-family="Arial, sans-serif">
        MOCK
      </text>
      <text x="24" y="118" fill="#fff" font-size="40" font-family="Arial, sans-serif" font-weight="700">
        ${initials || "NF"}
      </text>
      <text x="24" y="148" fill="rgba(255,255,255,0.82)" font-size="16" font-family="Arial, sans-serif">
        ${query.slice(0, 24)}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export function getMockSearchResults(
  query: string,
  maxResults = 25,
  publishedAfter?: string,
): EnrichedVideo[] {
  const queryLabel = titleCase(query);
  const querySlug = slugify(query);
  const publishedAfterTime = publishedAfter ? new Date(publishedAfter).getTime() : 0;

  const results = VIDEO_PATTERNS.map((pattern, index) => {
    const channelSubs = CHANNEL_SUBS[index];
    const channelAvgViews = CHANNEL_AVG_VIEWS[index];
    const outlierScore = OUTLIER_MULTIPLIERS[index];
    const views = Math.round(channelAvgViews * outlierScore);
    const likes = Math.max(24, Math.round(views * 0.045));
    const publishedAt = new Date(Date.now() - PUBLISHED_DAYS_AGO[index] * DAY_MS).toISOString();

    const video = {
      id: `mock-${querySlug}-${String(index + 1).padStart(2, "0")}`,
      channelId: `mock-channel-${querySlug}-${String(index + 1).padStart(2, "0")}`,
      channelTitle: fillPattern(CHANNEL_PATTERNS[index], queryLabel),
      title: fillPattern(pattern, queryLabel),
      description: `Mock result generated for testing the ${queryLabel} niche. The same interface will show live results when real YouTube data is connected.`,
      publishedAt,
      thumbnail: svgThumbnail(queryLabel, index),
      tags: [querySlug, "youtube", "outlier", "mock"],
      views,
      likes,
      comments: Math.max(3, Math.round(likes * 0.18)),
      duration: "PT8M12S",
      durationSeconds: parseIsoDurationToSeconds("PT8M12S"),
      channelSubs,
      channelAvgViews,
      channelTotalViews: Math.round(channelAvgViews * 120),
      channelVideoCount: 120,
      channelCreatedAt: new Date(Date.now() - (700 + index * 45) * DAY_MS).toISOString(),
      channelCountry: "US",
      outlierScore,
    };

    return {
      ...video,
      outlierReason: getOutlierReason(video),
    } satisfies EnrichedVideo;
  });

  return results
    .filter((item) => {
      if (!publishedAfterTime) return true;
      return new Date(item.publishedAt).getTime() >= publishedAfterTime;
    })
    .sort((a, b) => b.outlierScore - a.outlierScore)
    .slice(0, maxResults);
}
