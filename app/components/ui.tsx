// app/components/ui.tsx
// Shared low-level UI primitives for NicheFinder

import type { ReactNode } from "react";

// ─── Saturation ───────────────────────────────────────────────────────────────

type SatLevel = "low" | "medium-low" | "medium" | "medium-high" | "high";

const SAT_CONFIG: Record<SatLevel, { label: string; color: string; bg: string; border: string; dot: string }> = {
  "low":         { label: "Low",          color: "text-green-400",  bg: "bg-green-500/10",  border: "border-green-500/30",  dot: "bg-green-400"  },
  "medium-low":  { label: "Medium-Low",   color: "text-green-300",  bg: "bg-green-500/10",  border: "border-green-500/20",  dot: "bg-green-300"  },
  "medium":      { label: "Medium",       color: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/30",  dot: "bg-amber-400"  },
  "medium-high": { label: "Medium-High",  color: "text-amber-300",  bg: "bg-amber-500/10",  border: "border-amber-400/30",  dot: "bg-amber-300"  },
  "high":        { label: "High",         color: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/30",    dot: "bg-red-400"    },
};

export function SatBadge({ level, size = "sm" }: { level: string; size?: "sm" | "lg" }) {
  const c = SAT_CONFIG[level as SatLevel] ?? SAT_CONFIG["medium"];
  const sz = size === "lg" ? "px-3 py-1.5 text-sm font-semibold" : "px-2 py-0.5 text-xs font-medium";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border ${c.bg} ${c.border} ${c.color} ${sz}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {c.label} Saturation
    </span>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

type BadgeVariant = "neutral" | "green" | "amber" | "red" | "cyan";

const BADGE_LABEL_VARIANTS: Record<string, BadgeVariant> = {
  "Small channel winner": "green",
  "Breakout format":      "cyan",
  "High RPM":             "amber",
  "Low saturation":       "green",
};

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  neutral: "bg-neutral-800 text-neutral-300 border-neutral-700",
  green:   "bg-green-500/10 text-green-300 border-green-500/20",
  amber:   "bg-amber-500/10 text-amber-300 border-amber-500/20",
  red:     "bg-red-500/10 text-red-300 border-red-500/20",
  cyan:    "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
};

export function Badge({ label, variant }: { label: string; variant?: BadgeVariant }) {
  const v = variant ?? BADGE_LABEL_VARIANTS[label] ?? "neutral";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${BADGE_CLASSES[v]}`}>
      {label}
    </span>
  );
}

export function OutlierBadge({ score }: { score: number }) {
  const cls = score >= 10
    ? "text-green-300 bg-green-500/10 border-green-500/25"
    : score >= 5
    ? "text-amber-300 bg-amber-500/10 border-amber-500/25"
    : "text-neutral-300 bg-neutral-800 border-neutral-700";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 font-mono text-xs font-semibold ${cls}`}>
      {score.toFixed(1)}×
    </span>
  );
}

type Recommendation = "enter" | "avoid" | "research";

export function RecommendBadge({ rec }: { rec: Recommendation }) {
  const config: Record<Recommendation, { label: string; cls: string; icon: string }> = {
    enter:    { label: "Enter",         cls: "bg-green-500/15 text-green-300 border-green-500/30",  icon: "▶" },
    avoid:    { label: "Avoid",         cls: "bg-red-500/15 text-red-300 border-red-500/30",        icon: "✕" },
    research: { label: "Research More", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30", icon: "◎" },
  };
  const c = config[rec] ?? config.research;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-3 py-1 text-sm font-semibold ${c.cls}`}>
      <span>{c.icon}</span>
      {c.label}
    </span>
  );
}

// ─── Layout primitives ────────────────────────────────────────────────────────

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-neutral-800 bg-neutral-900/60 ${className}`}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title, sub, actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-neutral-100">{title}</span>
        {sub && <span className="text-xs text-neutral-500">{sub}</span>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label, value, sub, accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "red" | "cyan" | null;
}) {
  const accentCls = accent === "green" ? "text-green-400"
    : accent === "amber" ? "text-amber-400"
    : accent === "red"   ? "text-red-400"
    : accent === "cyan"  ? "text-cyan-400"
    : "text-neutral-100";
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">{label}</div>
      <div className={`font-mono text-xl font-bold leading-none ${accentCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  );
}

export function OpportunityMeter({ score }: { score: number }) {
  const color = score >= 70 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171";
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-widest text-neutral-500">Opportunity Score</span>
        <span className="font-mono text-sm font-bold" style={{ color }}>{score}/100</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function ChannelAvatar({ initials, size = 8 }: { initials: string; size?: number }) {
  const hue = ((initials.charCodeAt(0) * 37) + (initials.charCodeAt(Math.min(1, initials.length - 1)) * 13)) % 360;
  return (
    <div
      className={`flex h-${size} w-${size} flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white`}
      style={{
        background: `hsl(${hue} 50% 30%)`,
        border: `1px solid hsl(${hue} 50% 40%)`,
        minWidth: `${size * 4}px`,
        minHeight: `${size * 4}px`,
      }}
    >
      {initials.slice(0, 2).toUpperCase()}
    </div>
  );
}

export function AiBadge() {
  return (
    <span className="flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-400">
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse inline-block" />
      Claude
    </span>
  );
}

export function Divider() {
  return <div className="h-px bg-neutral-800" />;
}

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={`animate-spin text-neutral-500 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
