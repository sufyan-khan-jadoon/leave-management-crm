import type { LeaveStatus } from "@prisma/client";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { LEAVE_STATUS } from "@/lib/enums";

const CONFIG = {
  [LEAVE_STATUS.APPROVED]: { label: "Approved", variant: "success", Icon: CheckCircle2 },
  [LEAVE_STATUS.PENDING]: { label: "Pending", variant: "warning", Icon: Clock },
  [LEAVE_STATUS.REJECTED]: { label: "Rejected", variant: "destructive", Icon: XCircle },
} as const;

export function LeaveStatusBadge({ status }: { status: LeaveStatus }) {
  const { label, variant, Icon } = CONFIG[status];

  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
