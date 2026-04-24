import type { EnrichedVideo } from "./search-types";

const DAY_MS = 86_400_000;

type ReasonInput = Pick<
  EnrichedVideo,
  "views" | "channelSubs" | "channelAvgViews" | "outlierScore" | "publishedAt"
>;

export function getOutlierReason(video: ReasonInput): string {
  const ageDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(video.publishedAt).getTime()) / DAY_MS),
  );
  const viewsPerSub = video.channelSubs > 0 ? video.views / video.channelSubs : video.views;
  const avgMultiple =
    video.channelAvgViews > 0 ? video.views / video.channelAvgViews : video.outlierScore;

  if (video.outlierScore >= 10 && video.channelSubs < 10_000) {
    return "Small channel, viral spike";
  }

  if (avgMultiple >= 5 && ageDays <= 7) {
    return "Hot topic, catching a trend";
  }

  if (viewsPerSub >= 3) {
    return "Massively above subscriber base — algorithm push";
  }

  if (video.outlierScore >= 5) {
    return "Far above channel average performance";
  }

  if (video.outlierScore >= 2 && ageDays <= 14) {
    return "New video gaining early momentum";
  }

  return "Above average — worth watching";
}
