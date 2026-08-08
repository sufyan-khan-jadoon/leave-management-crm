"use client";

import { CalendarOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, todayUtc, utcWeekday } from "@/lib/date";
import type { HolidayView } from "@/types";

/**
 * Days the office is shut, on the screens where someone is deciding whether to
 * book leave.
 *
 * Rendered as "office closed" rather than as any kind of leave, because that is
 * what it is: the day costs nobody a day of their allowance, and showing it
 * beside the balance is what stops somebody spending one on a day the office was
 * never open. Hidden entirely when there are none — an empty card here would be
 * noise on every dashboard in the company for most of the year.
 */
export function UpcomingClosures({ closures }: { closures: HolidayView[] }) {
  if (closures.length === 0) return null;

  const today = todayUtc().getTime();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarOff className="text-primary-ink size-4" aria-hidden />
          Office closed
        </CardTitle>
        <CardDescription>
          No attendance is expected on these days, and they do not come out of your leave.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-border/60 divide-y">
          {closures.map((closure) => {
            const date = new Date(closure.date);

            return (
              <li key={closure.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="mr-auto min-w-0">
                  <p className="truncate font-medium">
                    {utcWeekday(date)}, {formatDate(date)}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">{closure.reason}</p>
                </div>

                <Badge variant={date.getTime() === today ? "default" : "secondary"}>
                  {date.getTime() === today ? "Closed today" : "Office closed"}
                </Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
