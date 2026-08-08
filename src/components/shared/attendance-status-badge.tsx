import { CalendarOff, CheckCircle2, Clock, Palmtree, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { AttendanceDayStatus } from "@/types";

const CONFIG = {
  PRESENT: { label: "Present", variant: "success", Icon: CheckCircle2 },
  ON_LEAVE: { label: "On leave", variant: "secondary", Icon: Palmtree },
  CLOSED: { label: "Office closed", variant: "secondary", Icon: CalendarOff },
  ABSENT: { label: "Absent", variant: "destructive", Icon: XCircle },
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
