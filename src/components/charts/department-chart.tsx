"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  CHART_PALETTE,
  axisTick,
  gridStroke,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "@/components/charts/chart-theme";

/** Horizontal bars — department names read far better on the Y axis. */
export function DepartmentChart({ data }: { data: Array<{ department: string; count: number }> }) {
  const top = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, top.length * 40)}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
        <YAxis
          type="category"
          dataKey="department"
          width={130}
          tickLine={false}
          axisLine={false}
          tick={axisTick}
        />
        <Tooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.35 }}
          contentStyle={tooltipContentStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
        />
        <Bar dataKey="count" name="Leaves" radius={[0, 6, 6, 0]} barSize={18}>
          {top.map((entry, index) => (
            <Cell key={entry.department} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
