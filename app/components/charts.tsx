"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSyncExternalStore } from "react";
import type { ChannelTrend } from "@/lib/trend";

type SaturationBarDatum = {
  label: string;
  value: number;
  display: string;
};

type TimelineDatum = {
  date: string;
  title: string;
  views: number;
};

const compact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
};

const emptySubscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function useMounted(): boolean {
  return useSyncExternalStore(emptySubscribe, clientSnapshot, serverSnapshot);
}

export function SaturationBarsChart({ data }: { data: SaturationBarDatum[] }) {
  const mounted = useMounted();

  return (
    <div className="h-56 w-full">
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 18, left: 0 }}>
            <CartesianGrid stroke="#262626" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#404040" }}
            />
            <YAxis
              tickFormatter={(value) => `${Math.round(Number(value) * 100)}%`}
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={42}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)" }}
              contentStyle={{
                background: "#171717",
                border: "1px solid #404040",
                borderRadius: 6,
                color: "#f5f5f5",
              }}
              formatter={(_, __, item) => item.payload.display}
            />
            <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function VideoTimelineChart({ data }: { data: TimelineDatum[] }) {
  const mounted = useMounted();

  return (
    <div className="mb-5 h-64 w-full">
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke="#262626" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "#404040" }}
            />
            <YAxis
              tickFormatter={(value) => compact(Number(value))}
              tick={{ fill: "#a3a3a3", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: "#171717",
                border: "1px solid #404040",
                borderRadius: 6,
                color: "#f5f5f5",
              }}
              formatter={(value) => [compact(Number(value)), "Views"]}
              labelFormatter={(_, payload) => payload?.[0]?.payload?.title ?? ""}
            />
            <Line
              type="monotone"
              dataKey="views"
              stroke="#ef4444"
              strokeWidth={2}
              dot={{ r: 2, fill: "#ef4444" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function TrendSparkline({ trend }: { trend: ChannelTrend }) {
  const mounted = useMounted();
  const color =
    trend.direction === "rising"
      ? "#34d399"
      : trend.direction === "falling"
      ? "#f87171"
      : "#a3a3a3";
  const data = [
    { name: "Prior", value: trend.avgPrior || Math.max(0, trend.avgRecent / 2) },
    { name: "Recent", value: trend.avgRecent },
  ];

  return (
    <span className="inline-block h-7 w-14 align-middle">
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              fill={color}
              fillOpacity={0.18}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </span>
  );
}
