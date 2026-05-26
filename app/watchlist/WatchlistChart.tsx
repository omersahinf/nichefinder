"use client";

import { useSyncExternalStore } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NicheSnapshot } from "@/lib/niche-snapshots";

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function useMounted() {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
}

interface Props {
  snapshots: NicheSnapshot[];
  metric: "opportunityScore" | "avgOutlier" | "smallWinRatio";
  color: string;
  label: string;
}

export function WatchlistChart({ snapshots, metric, color, label }: Props) {
  const mounted = useMounted();

  const data = [...snapshots]
    .reverse()
    .map((s) => ({
      date: new Date(s.snappedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value:
        metric === "smallWinRatio"
          ? Math.round(s[metric] * 100)
          : metric === "avgOutlier"
          ? Number(s[metric].toFixed(1))
          : s[metric],
    }));

  if (!mounted || data.length < 2) {
    return (
      <div className="h-16 flex items-center justify-center text-[10px] text-neutral-600">
        {data.length < 2 ? "Need 2+ snapshots for chart" : "Loading…"}
      </div>
    );
  }

  return (
    <div className="h-16 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "#525252" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              background: "#171717",
              border: "1px solid #404040",
              borderRadius: 4,
              fontSize: 10,
              padding: "4px 8px",
            }}
            itemStyle={{ color: "#e5e5e5" }}
            labelStyle={{ color: "#737373", marginBottom: 2 }}
            formatter={(v) => {
              const n = Number(v);
              return [
                metric === "smallWinRatio" ? `${n}%` : metric === "avgOutlier" ? `${n}×` : String(n),
                label,
              ];
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={{ r: 2, fill: color }}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
