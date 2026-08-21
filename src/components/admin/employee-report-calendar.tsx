"use client";

import { useMemo, useState } from "react";
import { CalendarRange, MapPin, UserCheck } from "lucide-react";

import { AttendanceStatusBadge } from "@/components/shared/attendance-status-badge";
import { DAY_STATUS_ORDER, DAY_STATUS_VISUAL } from "@/components/shared/day-status-visuals";
import { LeaveStatusBadge } from "@/components/shared/leave-status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { formatDate, formatTimeInAppZone, monthLabel } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import { describeLateness } from "@/lib/lateness";
import { dayStatusLabel } from "@/lib/report-labels";
import { cn } from "@/lib/utils";
import type { ReportDayView } from "@/types";

/** Monday first, matching the week the presets and the trend chart both use. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * The period as a calendar, one cell per day.
 *
 * **It prints every date, which is what makes it a calendar rather than a second
 * copy of the table.** The records table shows the days that are records —
 * `recordTypeOf` sends closures, weekly days off, empty days and the future to
 * nothing — and that is right for a list somebody reads down. A month with the
 * weekends cut out is not a month, so this reads `report.calendar`, the full day
 * walk, instead.
 *
 * It derives nothing. Each cell's colour and wording come from the verdict
 * `describeDay` reached on the server, through the same `dayStatusLabel` the
 * badge and the three exports use.
 */
export function EmployeeReportCalendar({ days }: { days: ReportDayView[] }) {
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Grouped into calendar months, each padded to start on a Monday so the
  // columns line up with the weekday header. A period of three weeks spanning
  // two months is drawn as two grids rather than a running strip, because that
  // is how anybody asked to find "the 3rd" would look for it.
  const months = useMemo(() => groupByMonth(days), [days]);

  // Which statuses this period actually contains. A legend naming eight when the
  // month held three is seven lines to read past.
  const present = useMemo(() => {
    const seen = new Set(days.map((day) => day.status));
    return DAY_STATUS_ORDER.filter((status) => seen.has(status));
  }, [days]);

  const selected = openDate ? days.find((day) => day.date === openDate) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {present.map((status) => (
          <span key={status} className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <span
              className="size-2.5 rounded-full"
              style={{ background: DAY_STATUS_VISUAL[status].color }}
              aria-hidden
            />
            {dayStatusLabel(status)}
          </span>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {months.map((month) => (
          <div key={month.key} className="space-y-2">
            <p className="text-sm font-semibold tracking-[-0.012em]">{month.label}</p>

            <div className="grid grid-cols-7 gap-1" role="grid" aria-label={month.label}>
              {WEEKDAYS.map((weekday) => (
                <div
                  key={weekday}
                  className="text-muted-foreground pb-1 text-center text-[0.6875rem] font-medium"
                >
                  {weekday}
                </div>
              ))}

              {/* Blanks before the first of the month, so the columns line up. */}
              {Array.from({ length: month.offset }, (_, index) => (
                <div key={`pad-${index}`} aria-hidden />
              ))}

              {month.days.map((day) => {
                const isOpen = openDate === day.date;

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setOpenDate(isOpen ? null : day.date)}
                    aria-pressed={isOpen}
                    // The date and the verdict together: a screen reader reaches
                    // "21 August 2026, Present", where the visible cell can only
                    // afford the number and a colour.
                    aria-label={`${formatDate(day.date)} — ${dayStatusLabel(day.status)}`}
                    title={`${formatDate(day.date)} — ${dayStatusLabel(day.status)}`}
                    className={cn(
                      "focus-visible:ring-ring relative flex aspect-square items-center justify-center rounded-lg border text-xs font-medium tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      DAY_STATUS_VISUAL[day.status].cell,
                      isOpen && "ring-primary ring-2",
                    )}
                  >
                    {new Date(day.date).getUTCDate()}
                    {/* Lateness is a qualifier on a present day, not a status of
                        its own — the roster's rule, kept here so a late day is
                        still visibly a day somebody came in. */}
                    {day.lateMinutes > 0 && (
                      <span
                        className="bg-warning absolute right-1 bottom-1 size-1.5 rounded-full"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selected && <DayDetail day={selected} />}
    </div>
  );
}

/**
 * One day, opened.
 *
 * A panel below the grid rather than a popover on the cell: the detail runs to
 * five or six lines on a corrected day, and a tooltip that long is unreadable on
 * a phone and unreachable by keyboard.
 */
function DayDetail({ day }: { day: ReportDayView }) {
  return (
    <Card className="py-0">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-medium">
            <CalendarRange className="text-muted-foreground size-4" aria-hidden />
            {formatDate(day.date)}
          </p>
          <AttendanceStatusBadge status={day.status} />
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Detail label="Check-in">
            {day.checkInAt ? formatTimeInAppZone(day.checkInAt) : "No check-in"}
          </Detail>

          <Detail label="Arrival">
            {day.lateMinutes > 0 ? (
              <span
                className="text-warning-ink font-medium"
                // The deadline as well as the figure: a report outlives the
                // setting, and "15 min late" is unreadable once somebody has
                // moved the cutoff underneath it.
                title={
                  day.lateBasisMinutes !== null
                    ? `Measured from the ${friendlyTimeLabel(day.lateBasisMinutes)} cutoff in force that day`
                    : undefined
                }
              >
                {describeLateness(day.lateMinutes)} late
              </span>
            ) : day.checkInAt ? (
              "On time"
            ) : (
              "—"
            )}
          </Detail>

          {/*
            A day vouched for by an administrator says so, and shows no distance —
            because there is none. That is the whole difference between a record
            the building proved and one somebody asserted, and it must not be lost
            on the screen somebody reads a person's month from.
          */}
          {day.markedBy ? (
            <Detail label="Recorded by">
              <span className="flex items-center gap-1.5">
                <UserCheck className="size-3.5 shrink-0" aria-hidden />
                {day.markedBy.name}
              </span>
            </Detail>
          ) : (
            <Detail label="Distance from office">
              {day.distanceMeters === null ? (
                "—"
              ) : (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {formatDistance(day.distanceMeters)}
                </span>
              )}
            </Detail>
          )}

          {day.markedReason && <Detail label="Reason given">{day.markedReason}</Detail>}

          {day.leaveStatus && (
            <>
              <Detail label="Leave">
                <LeaveStatusBadge status={day.leaveStatus} />
              </Detail>
              {day.leaveReason && <Detail label="Leave reason">{day.leaveReason}</Detail>}
            </>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

type CalendarMonth = {
  key: string;
  label: string;
  /** Blank cells before the first of the month, counting from Monday. */
  offset: number;
  days: ReportDayView[];
};

function groupByMonth(days: ReportDayView[]): CalendarMonth[] {
  const months = new Map<string, CalendarMonth>();

  for (const day of days) {
    const date = new Date(day.date);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;

    const month = months.get(key) ?? {
      key,
      label: monthLabel(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))),
      // The offset is taken from the first day the *period* holds, not from the
      // first of the month — a report starting on the 10th draws its first cell
      // under the weekday the 10th actually fell on.
      offset: (date.getUTCDay() + 6) % 7,
      days: [],
    };

    month.days.push(day);
    months.set(key, month);
  }

  return [...months.values()];
}
