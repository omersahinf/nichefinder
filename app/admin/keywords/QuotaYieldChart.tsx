"use client";

import { useSyncExternalStore } from "react";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
function useMounted() {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
}

interface DayDatum {
  date: string;
  quotaUsed: number;
  newChannels: number;
  yieldPerKeyword: number;
}

interface Props {
  data: DayDatum[];
}

export function QuotaYieldChart({ data }: Props) {
  const mounted = useMounted();
  if (!mounted || data.length === 0) {
    return <div className="h-32 flex items-center justify-center text-xs text-neutral-600">No data yet</div>;
  }

  return (
    <div className="space-y-4">
      {/* Quota + channels bar chart */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-600 mb-1.5">Daily Quota vs New Channels</div>
        <div className="h-36 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#525252" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="quota" tick={{ fontSize: 9, fill: "#525252" }} axisLine={false} tickLine={false} width={40} />
              <YAxis yAxisId="channels" orientation="right" tick={{ fontSize: 9, fill: "#525252" }} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: "#171717", border: "1px solid #404040", borderRadius: 4, fontSize: 10, padding: "4px 8px" }}
                itemStyle={{ color: "#e5e5e5" }}
                labelStyle={{ color: "#737373", marginBottom: 2 }}
              />
              <Bar yAxisId="quota" dataKey="quotaUsed" name="Quota used" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} />
              <Bar yAxisId="channels" dataKey="newChannels" name="New channels" fill="#22c55e" opacity={0.7} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Yield per keyword trend */}
      <div>
        <div className="text-[10px] uppercase tracking-wide text-neutral-600 mb-1.5">Yield per Keyword (channels / keyword run)</div>
        <div className="h-24 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 2, right: 8, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#525252" }} axisLine={false} tickLine={false} />
              <YAxis hide domain={[0, "auto"]} />
              <Tooltip
                contentStyle={{ background: "#171717", border: "1px solid #404040", borderRadius: 4, fontSize: 10, padding: "4px 8px" }}
                itemStyle={{ color: "#e5e5e5" }}
                labelStyle={{ color: "#737373", marginBottom: 2 }}
                formatter={(v) => [Number(v).toFixed(1), "channels/keyword"]}
              />
              <Line type="monotone" dataKey="yieldPerKeyword" stroke="#f59e0b" strokeWidth={1.5} dot={{ r: 2, fill: "#f59e0b" }} activeDot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
