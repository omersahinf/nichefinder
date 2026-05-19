// app/components/NicheOverview.tsx
import type { SaturationReport } from "@/lib/saturation";
import { Panel, PanelHeader, StatCard, SatBadge, OpportunityMeter } from "./ui";

const SAT_LABELS: Record<string, string> = {
  low: "Low", "medium-low": "Med-Low", medium: "Medium", "medium-high": "Med-High", high: "High",
};

const fmt = (n: number) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
};

interface Props {
  saturation: SaturationReport;
  query: string;
}

export function NicheOverview({ saturation, query }: Props) {
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
      <div className="grid grid-cols-2 gap-px bg-neutral-800 sm:grid-cols-4">
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
