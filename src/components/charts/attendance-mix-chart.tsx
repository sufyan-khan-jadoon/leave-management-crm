"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import {
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "@/components/charts/chart-theme";
import { DAY_STATUS_VISUAL } from "@/components/shared/day-status-visuals";
import { dayStatusLabel } from "@/lib/report-labels";
import type { AttendanceDayStatus } from "@/types";

export type AttendanceMixSlice = { status: AttendanceDayStatus; value: number };

/**
 * How a period was spent, as one ring.
 *
 * A doughnut rather than a bar chart because these are **parts of one whole** —
 * every day in the period is in exactly one slice, which is the property
 * `describeDay` guarantees and the only reason a proportional chart is honest
 * here. Slices holding nothing are dropped rather than drawn at zero width: a
 * legend entry for a status the period does not contain is a line to read past.
 *
 * The colours are `DAY_STATUS_VISUAL`, shared with the calendar underneath, so a
 * green wedge and a green cell mean the same thing on one screen. Nothing is
 * summed here — the counts arrive from the server.
 */
export function AttendanceMixChart({ data }: { data: AttendanceMixSlice[] }) {
  const slices = data.filter((slice) => slice.value > 0);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="status"
          innerRadius="58%"
          outerRadius="88%"
          paddingAngle={2}
          strokeWidth={0}
        >
          {slices.map((slice) => (
            <Cell key={slice.status} fill={DAY_STATUS_VISUAL[slice.status].color} />
          ))}
        </Pie>

        <Tooltip
          contentStyle={tooltipContentStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          formatter={(value, name) => {
            const days = Number(value);
            return [`${days} ${days === 1 ? "day" : "days"}`, dayStatusLabel(String(name))];
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
