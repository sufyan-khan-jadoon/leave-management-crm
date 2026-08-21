import { CalendarOff, CheckCircle2, CircleDashed, Clock, Coffee, House, Palmtree, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { dayStatusLabel } from "@/lib/report-labels";
import type { AttendanceDayStatus } from "@/types";

/**
 * The tier and the icon for each verdict.
 *
 * **The wording is deliberately not here.** It comes from `dayStatusLabel`,
 * which the three exports and the report calendar read as well, so a badge, a
 * calendar cell and an archived spreadsheet cannot say three different words
 * about one date.
 */
export const DAY_STATUS_BADGE = {
  PRESENT: { variant: "success", Icon: CheckCircle2 },
  ON_LEAVE: { variant: "secondary", Icon: Palmtree },
  // `warning` rather than `success` or `secondary`, and the choice is about
  // being *distinguishable* rather than about approval. Green is what "present"
  // means on this screen, so a remote day dressed in it would read as somebody
  // who came in; the muted grey is what every not-a-working-day status wears,
  // and remote is the opposite of those — it is a day somebody is working.
  // Amber is the one remaining tier in the palette, and it carries no verdict:
  // nothing is held against a remote day.
  REMOTE: { variant: "warning", Icon: House },
  CLOSED: { variant: "secondary", Icon: CalendarOff },
  NON_WORKING: { variant: "secondary", Icon: Coffee },
  ABSENT: { variant: "destructive", Icon: XCircle },
  // Deliberately not `destructive`. Nothing is known about the day, so nothing
  // is being held against anybody — colouring it like a missed day would be the
  // accusation the status exists to withhold.
  NO_RECORD: { variant: "secondary", Icon: CircleDashed },
  UPCOMING: { variant: "secondary", Icon: Clock },
} as const satisfies Record<AttendanceDayStatus, unknown>;

export function AttendanceStatusBadge({ status }: { status: AttendanceDayStatus }) {
  const { variant, Icon } = DAY_STATUS_BADGE[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {dayStatusLabel(status)}
    </Badge>
  );
}
