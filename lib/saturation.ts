import type { EnrichedVideo } from "./search-types";

export interface SaturationReport {
  totalChannels: number;
  medianSubs: number;
  smallChannelCount: number;
  smallChannelRatio: number;
  smallChannelOutliers: number;
  smallOutlierRatio: number;
  avgOutlier: number;
  level: "low" | "medium" | "high";
  label: string;
  hint: string;
}

const SMALL_CHANNEL_THRESHOLD = 10_000;
const OUTLIER_MIN = 2;

const median = (nums: number[]): number => {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

export function computeSaturation(videos: EnrichedVideo[]): SaturationReport | null {
  if (videos.length === 0) return null;

  const channelMap = new Map<string, { subs: number; bestOutlier: number }>();
  for (const v of videos) {
    const existing = channelMap.get(v.channelId);
    if (!existing || v.outlierScore > existing.bestOutlier) {
      channelMap.set(v.channelId, {
        subs: v.channelSubs,
        bestOutlier: v.outlierScore,
      });
    }
  }

  const channels = Array.from(channelMap.values());
  const totalChannels = channels.length;
  const subsList = channels.map((c) => c.subs);
  const med = median(subsList);
  const small = channels.filter((c) => c.subs < SMALL_CHANNEL_THRESHOLD);
  const smallOutliers = small.filter((c) => c.bestOutlier >= OUTLIER_MIN);
  const avgOutlier =
    videos.reduce((sum, v) => sum + v.outlierScore, 0) / videos.length;

  const smallRatio = totalChannels > 0 ? small.length / totalChannels : 0;
  const smallOutlierRatio = small.length > 0 ? smallOutliers.length / small.length : 0;

  let level: SaturationReport["level"];
  let label: string;
  let hint: string;

  if (smallOutlierRatio >= 0.3 && med < 100_000) {
    level = "low";
    label = "Low saturation";
    hint = "Underserved niche with room for small channels to break out.";
  } else if (smallOutlierRatio >= 0.1 || med < 500_000) {
    level = "medium";
    label = "Medium saturation";
    hint = "Balanced competition; differentiation still pays.";
  } else {
    level = "high";
    label = "High saturation";
    hint = "Dominated by established channels; find a sub-angle.";
  }

  return {
    totalChannels,
    medianSubs: med,
    smallChannelCount: small.length,
    smallChannelRatio: smallRatio,
    smallChannelOutliers: smallOutliers.length,
    smallOutlierRatio,
    avgOutlier,
    level,
    label,
    hint,
  };
}
