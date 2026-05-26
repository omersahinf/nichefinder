import type { SaturationReport } from "@/lib/saturation";
import type { NicheDecision, NicheVerdict } from "@/lib/niche-decision";
import { Panel, PanelHeader, StatCard, SatBadge, OpportunityMeter } from "./ui";

const SAT_LABELS: Record<string, string> = {
  low: "Low", "medium-low": "Med-Low", medium: "Medium", "medium-high": "Med-High", high: "High",
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

const VERDICT_CONFIG: Record<NicheVerdict, {
  label: string;
  icon: string;
  cls: string;
  barCls: string;
}> = {
  Enter: {
    label: "Enter",
    icon: "▶",
    cls: "border-green-500/40 bg-green-500/10 text-green-300",
    barCls: "bg-green-500",
  },
  Test: {
    label: "Test",
    icon: "◎",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    barCls: "bg-amber-500",
  },
  Avoid: {
    label: "Avoid",
    icon: "✕",
    cls: "border-red-500/40 bg-red-500/10 text-red-300",
    barCls: "bg-red-500",
  },
};

function VerdictCard({ decision }: { decision: NicheDecision }) {
  const config = VERDICT_CONFIG[decision.verdict];

  return (
    <div className={`rounded-lg border px-4 py-3 ${config.cls}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="text-xl">{config.icon}</span>
          <div>
            <div className="text-xs uppercase tracking-widest font-semibold opacity-70 mb-0.5">
              Verdict
            </div>
            <div className="text-lg font-bold leading-none">{config.label}</div>
          </div>
        </div>
        {/* Score bar */}
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-lg font-bold">{decision.score}</span>
          <div className="h-1.5 w-24 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${config.barCls}`}
              style={{ width: `${decision.score}%` }}
            />
          </div>
          <span className="text-[10px] opacity-60">out of 100</span>
        </div>
      </div>
      {decision.reasons.length > 0 && (
        <ul className="mt-3 space-y-1">
          {decision.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs opacity-80">
              <span className="mt-0.5 flex-shrink-0">·</span>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  saturation: SaturationReport;
  query: string;
  decision?: NicheDecision | null;
}

export function NicheOverview({ saturation, query, decision }: Props) {
  const stats = [
    { label: "Total Videos",     value: saturation.totalVideos,                         sub: "matched"         },
    { label: "Unique Channels",  value: saturation.uniqueChannels,                      sub: "indexed"         },
    { label: "Small-ch Outliers",value: saturation.smallChannelOutliers,                sub: "< 50K subs",     accent: "green" as const },
    { label: "Median Subs",      value: fmt(saturation.medianChannelSubs),              sub: "per channel"     },
    { label: "Est. RPM",         value: `$${saturation.rpmMin ?? "?"}–$${saturation.rpmMax ?? "?"}`, sub: "USD / 1K views", accent: "amber" as const },
    { label: "Avg Outlier",      value: `${(saturation.avgOutlierScore ?? 0).toFixed(1)}×`, sub: "vs channel avg", accent: "cyan" as const },
    { label: "Opportunity",      value: String(saturation.opportunityScore ?? 0),       sub: "/ 100",          accent: (saturation.opportunityScore ?? 0) >= 70 ? "green" as const : "amber" as const },
    { label: "Saturation",       value: SAT_LABELS[saturation.level] ?? saturation.level, sub: "classification" },
  ];

  return (
    <Panel>
      <PanelHeader
        title="Niche Overview"
        sub={query}
        actions={<SatBadge level={saturation.level} />}
      />
      {decision && (
        <div className="px-4 pt-3">
          <VerdictCard decision={decision} />
        </div>
      )}
      <div className={`grid grid-cols-2 gap-px bg-neutral-800 sm:grid-cols-4 ${decision ? "mt-3" : ""}`}>
        {stats.map((s, i) => (
          <div key={i} className="bg-neutral-900/60 px-4 py-3">
            <StatCard {...s} />
          </div>
        ))}
      </div>
      <div className="px-4 py-3">
        <OpportunityMeter score={saturation.opportunityScore ?? 0} />
      </div>
    </Panel>
  );
}
