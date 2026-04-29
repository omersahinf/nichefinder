export interface DurationRange {
  minSeconds: number;
  maxSeconds: number;
  label: string;
}

export const DURATION_PRESETS: DurationRange[] = [
  { label: "Any", minSeconds: 0, maxSeconds: Number.POSITIVE_INFINITY },
  { label: "Under 1m", minSeconds: 0, maxSeconds: 60 },
  { label: "1-4m", minSeconds: 60, maxSeconds: 240 },
  { label: "Medium (4-20m)", minSeconds: 240, maxSeconds: 1200 },
  { label: "Long (20m+)", minSeconds: 1200, maxSeconds: Number.POSITIVE_INFINITY },
];

export function parseIsoDurationToSeconds(iso: string): number {
  if (!iso) return 0;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!match) return 0;
  const [, h, m, s] = match;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
}

export function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
