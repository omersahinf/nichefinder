const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;

export function estimateMonetized(channel: {
  subs: number;
  videoCount: number;
  createdAt?: string;
}): boolean {
  const createdAt = channel.createdAt ? new Date(channel.createdAt).getTime() : NaN;
  const channelAgeMonths = Number.isFinite(createdAt)
    ? (Date.now() - createdAt) / MONTH_MS
    : 0;

  return channel.subs >= 1_000 && channel.videoCount >= 10 && channelAgeMonths >= 4;
}
