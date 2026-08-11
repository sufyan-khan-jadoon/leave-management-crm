import { CalendarOff, CheckCircle2, CircleDashed, Clock, Coffee, Palmtree, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AttendanceDayStatus } from "@/types";

const CONFIG = {
  PRESENT: { label: "Present", variant: "success", Icon: CheckCircle2 },
  ON_LEAVE: { label: "On leave", variant: "secondary", Icon: Palmtree },
  CLOSED: { label: "Office closed", variant: "secondary", Icon: CalendarOff },
  NON_WORKING: { label: "Non-working day", variant: "secondary", Icon: Coffee },
  ABSENT: { label: "Absent", variant: "destructive", Icon: XCircle },
  // Deliberately not `destructive`. Nothing is known about the day, so nothing
  // is being held against anybody — colouring it like a missed day would be the
  // accusation the status exists to withhold.
  NO_RECORD: { label: "No record", variant: "secondary", Icon: CircleDashed },
  UPCOMING: { label: "Not yet", variant: "secondary", Icon: Clock },
} as const satisfies Record<AttendanceDayStatus, unknown>;

export function AttendanceStatusBadge({ status }: { status: AttendanceDayStatus }) {
  const { label, variant, Icon } = CONFIG[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
