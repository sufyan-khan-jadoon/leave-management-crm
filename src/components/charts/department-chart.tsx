"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const PALETTE = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

/** Horizontal bars — department names read far better on the Y axis. */
export function DepartmentChart({ data }: { data: Array<{ department: string; count: number }> }) {
  const top = data.slice(0, 8);

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, top.length * 40)}>
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey="department"
          width={130}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--color-muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.75rem",
            color: "var(--color-popover-foreground)",
            fontSize: "0.8125rem",
          }}
        />
        <Bar dataKey="count" name="Leaves" radius={[0, 6, 6, 0]} barSize={18}>
          {top.map((entry, index) => (
            <Cell key={entry.department} fill={PALETTE[index % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
