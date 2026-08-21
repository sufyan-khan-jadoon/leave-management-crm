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
  const slices = data
    .filter((slice) => slice.value > 0)
    // Largest first, so the ring reads clockwise from the biggest share and two
    // months of the same person are laid out comparably.
    .sort((a, b) => b.value - a.value);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <div className="space-y-3">
      <ResponsiveContainer width="100%" height={220}>
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

      {/*
        A ring whose only labels are hover tooltips is unreadable on a phone and
        unreachable by keyboard, and this one is mostly neutral tones that need
        naming. The counts are the same numbers the ring was drawn from, so the
        legend cannot disagree with it.
      */}
      <ul className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
        {slices.map((slice) => (
          <li key={slice.status} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ background: DAY_STATUS_VISUAL[slice.status].color }}
              aria-hidden
            />
            <span className="text-muted-foreground min-w-0 flex-1 truncate">
              {dayStatusLabel(slice.status)}
            </span>
            <span className="tabular-nums">{slice.value}</span>
            <span className="text-muted-foreground w-11 text-right text-xs tabular-nums">
              {Math.round((slice.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
