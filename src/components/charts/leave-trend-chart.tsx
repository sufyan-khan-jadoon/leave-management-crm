"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  axisTick,
  gridStroke,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "@/components/charts/chart-theme";
import { monthLabel } from "@/lib/date";
import type { MonthlyTrendPoint } from "@/types";

/**
 * Split by decision, so the series borrow the *status* colours rather than the
 * green chart ramp — a reader who has learned "amber = pending" from the badges
 * should not have to learn a second encoding to read the chart. Approved is the
 * exact brand green, which is also what `--success` resolves to.
 */
const SERIES = [
  { key: "approved", label: "Approved", color: "var(--color-success)" },
  { key: "pending", label: "Pending", color: "var(--color-warning)" },
  { key: "rejected", label: "Rejected", color: "var(--color-destructive)" },
] as const;

/** Stacked monthly leave volume, split by decision. */
export function LeaveTrendChart({ data }: { data: MonthlyTrendPoint[] }) {
  const points = data.map((point) => ({ ...point, label: monthLabel(new Date(point.month)) }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <defs>
          {SERIES.map((series) => (
            <linearGradient key={series.key} id={`fill-${series.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={series.color} stopOpacity={0.45} />
              <stop offset="95%" stopColor={series.color} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
        <Tooltip
          cursor={{ stroke: gridStroke }}
          contentStyle={tooltipContentStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: "0.8125rem", color: "var(--color-muted-foreground)" }}
        />

        {SERIES.map((series) => (
          <Area
            key={series.key}
            type="monotone"
            dataKey={series.key}
            name={series.label}
            stackId="1"
            stroke={series.color}
            strokeWidth={2}
            fill={`url(#fill-${series.key})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
