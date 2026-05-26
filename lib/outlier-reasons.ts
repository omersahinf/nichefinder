import type { EnrichedVideo } from "./search-types";

const DAY_MS = 86_400_000;

type ReasonInput = Pick<
  EnrichedVideo,
  "views" | "channelSubs" | "channelAvgViews" | "outlierScore" | "publishedAt" | "isShort" | "category" | "rpmUsd"
>;

export interface OutlierExplanation {
  summary: string;
  factors: Array<{ label: string; value: string; signal: "positive" | "neutral" | "note" }>;
}

export function getOutlierReason(video: ReasonInput): string {
  return buildOutlierExplanation(video).summary;
}

export function buildOutlierExplanation(video: ReasonInput): OutlierExplanation {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(video.publishedAt).getTime()) / DAY_MS),
  );
  const avgMultiple =
    video.channelAvgViews > 0 ? video.views / video.channelAvgViews : video.outlierScore;
  const viewsPerSub = video.channelSubs > 0 ? video.views / video.channelSubs : 0;
  const isSmallChannel = video.channelSubs < 50_000;
  const isTiny = video.channelSubs < 10_000;
  const isRecent = ageDays <= 14;

  const factors: OutlierExplanation["factors"] = [];

  // Channel baseline ratio
  if (avgMultiple >= 2) {
    factors.push({
      label: "vs channel average",
      value: `${avgMultiple.toFixed(1)}× channel avg`,
      signal: avgMultiple >= 5 ? "positive" : "neutral",
    });
  }

  // Small channel winning
  if (isTiny && video.outlierScore >= 5) {
    factors.push({
      label: "tiny channel",
      value: `${(video.channelSubs / 1000).toFixed(1)}K subs → viral`,
      signal: "positive",
    });
  } else if (isSmallChannel && video.outlierScore >= 3) {
    factors.push({
      label: "small channel winner",
      value: `< 50K subs, ${video.outlierScore.toFixed(1)}× outlier`,
      signal: "positive",
    });
  }

  // Recency signal
  if (isRecent && video.outlierScore >= 3) {
    factors.push({
      label: "upload age",
      value: ageDays === 0 ? "published today" : `${ageDays}d old`,
      signal: ageDays <= 3 ? "positive" : "neutral",
    });
  }

  // Views per sub
  if (viewsPerSub > 0) {
    const label = viewsPerSub >= 2 ? "far above sub base" : viewsPerSub >= 0.5 ? "above sub base" : "below sub base";
    factors.push({
      label: "views vs subs",
      value: `${viewsPerSub.toFixed(2)} views/sub (${label})`,
      signal: viewsPerSub >= 1 ? "positive" : "note",
    });
  }

  // Category RPM
  if (video.rpmUsd && video.rpmUsd >= 6) {
    factors.push({
      label: "category RPM",
      value: `~$${video.rpmUsd}/1K views (${video.category ?? "??"})`,
      signal: "note",
    });
  }

  // Format
  if (video.isShort) {
    factors.push({ label: "format", value: "Shorts", signal: "note" });
  }

  // Summary sentence
  let summary: string;
  if (isTiny && video.outlierScore >= 10) {
    summary = "Tiny channel viral spike";
  } else if (isRecent && avgMultiple >= 5) {
    summary = "Hot topic catching a trend";
  } else if (viewsPerSub >= 3) {
    summary = "Algorithm push — far beyond subscriber base";
  } else if (avgMultiple >= 5) {
    summary = "Far above channel average performance";
  } else if (video.outlierScore >= 5) {
    summary = `${video.outlierScore.toFixed(1)}× above channel avg`;
  } else if (isRecent && video.outlierScore >= 2) {
    summary = "New video gaining early momentum";
  } else {
    summary = "Above average — worth monitoring";
  }

  return { summary, factors };
}
