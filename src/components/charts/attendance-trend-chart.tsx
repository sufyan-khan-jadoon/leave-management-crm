"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  axisTick,
  gridStroke,
  tooltipContentStyle,
  tooltipItemStyle,
  tooltipLabelStyle,
} from "@/components/charts/chart-theme";
import { DAY_STATUS_VISUAL } from "@/components/shared/day-status-visuals";
import { monthLabel } from "@/lib/date";
import { dayStatusLabel } from "@/lib/report-labels";
import type { TrendBucket, TrendGranularity } from "@/lib/report-trend";

/**
 * The four record kinds, in the order the tiles and the table take them, wearing
 * the colours the calendar and the mix chart use. A reader who has learned that
 * green means present from one should not have to learn it again from another.
 */
const SERIES = [
  { key: "present", status: "PRESENT" },
  { key: "absent", status: "ABSENT" },
  { key: "onLeave", status: "ON_LEAVE" },
  { key: "remote", status: "REMOTE" },
] as const;

/**
 * Attendance over the period, stacked.
 *
 * **Stacked rather than grouped**, because each column is a bucket of days and
 * every day in it is exactly one of the four — so the column height is the days
 * the bucket actually holds, and a shrinking stack means a shorter week rather
 * than worse attendance. Grouped bars would put four independent series side by
 * side and lose that.
 *
 * The granularity is chosen from the length of the period rather than offered as
 * a control: a year cut into days is 365 two-pixel bars, which is a texture and
 * not a chart. See `trendGranularityFor`.
 */
export function AttendanceTrendChart({
  data,
  granularity,
}: {
  data: TrendBucket[];
  granularity: TrendGranularity;
}) {
  const points = data.map((bucket) => ({
    ...bucket,
    label: labelFor(bucket.start, granularity),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={points} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={axisTick}
          // A long period has more columns than there is room for labels, so
          // Recharts drops the ones that would collide rather than overlapping
          // them into an unreadable band.
          interval="preserveStartEnd"
          minTickGap={16}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={axisTick} />
        <Tooltip
          cursor={{ fill: "var(--color-brand)", opacity: 0.06 }}
          contentStyle={tooltipContentStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: "0.8125rem", color: "var(--color-muted-foreground)" }}
        />

        {SERIES.map((series, index) => (
          <Bar
            key={series.key}
            dataKey={series.key}
            name={dayStatusLabel(series.status)}
            stackId="days"
            fill={DAY_STATUS_VISUAL[series.status].color}
            // Only the top of the stack is rounded, so the four segments read as
            // one column rather than as four stacked pills.
            radius={index === SERIES.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * How a bucket names itself on the axis: the day, the week it starts, the month.
 *
 * Deliberately shorter than `formatDate`, which carries the year — an axis of
 * "Aug 21, 2026" repeated thirty times is a wall, and the year is already on the
 * period label above the chart. The tooltip carries the same short form, so
 * hovering never disagrees with the tick beneath it.
 */
const AXIS_DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function labelFor(start: Date, granularity: TrendGranularity): string {
  if (granularity === "MONTH") return monthLabel(start);

  const date = AXIS_DAY.format(start);
  return granularity === "WEEK" ? `w/c ${date}` : date;
}
