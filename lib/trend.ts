export type TrendDirection = "rising" | "flat" | "falling";

export interface ChannelTrend {
  growth30d: number;
  direction: TrendDirection;
  avgRecent: number;
  avgPrior: number;
  sampleSize: number;
}

export interface VideoSample {
  views: number;
  publishedAt: string;
}

const DAY_MS = 86_400_000;
const RECENT_WINDOW_DAYS = 30;
const PRIOR_WINDOW_DAYS = 60;
const MIN_SAMPLES_PER_WINDOW = 2;
const RISING_THRESHOLD = 0.2;
const FALLING_THRESHOLD = -0.2;

const average = (views: number[]): number =>
  views.length === 0 ? 0 : views.reduce((sum, v) => sum + v, 0) / views.length;

const directionFor = (growth: number): TrendDirection => {
  if (growth >= RISING_THRESHOLD) return "rising";
  if (growth <= FALLING_THRESHOLD) return "falling";
  return "flat";
};

export function computeChannelTrend(
  samples: VideoSample[],
  now = Date.now(),
): ChannelTrend | null {
  if (samples.length < MIN_SAMPLES_PER_WINDOW * 2) return null;

  const recentCutoff = now - RECENT_WINDOW_DAYS * DAY_MS;
  const priorCutoff = now - PRIOR_WINDOW_DAYS * DAY_MS;

  const recent: number[] = [];
  const prior: number[] = [];

  for (const sample of samples) {
    const publishedAt = new Date(sample.publishedAt).getTime();
    if (!Number.isFinite(publishedAt)) continue;

    if (publishedAt >= recentCutoff) {
      recent.push(sample.views);
    } else if (publishedAt >= priorCutoff) {
      prior.push(sample.views);
    }
  }

  if (recent.length < MIN_SAMPLES_PER_WINDOW || prior.length < MIN_SAMPLES_PER_WINDOW) {
    return null;
  }

  const avgRecent = average(recent);
  const avgPrior = average(prior);
  if (avgPrior <= 0) return null;

  const growth30d = (avgRecent - avgPrior) / avgPrior;

  return {
    growth30d,
    direction: directionFor(growth30d),
    avgRecent,
    avgPrior,
    sampleSize: recent.length + prior.length,
  };
}
