import { Badge } from "@/components/ui/badge";
import { complaintStatusLabel } from "@/lib/complaint-status";
import type { ComplaintStatusView } from "@/types";

/**
 * One status, worded and coloured the same way everywhere.
 *
 * Shared by the employee's table and the administrator's rather than each
 * spelling out its own map — that is how the same complaint comes to read
 * "Under review" on one screen and "In progress" on the other.
 *
 * The colours follow the FILL/INK rule: every one of these is a tinted pill with
 * an `-ink` foreground, so none of them puts brand green on a light surface.
 * Pending is `outline` rather than a colour because "nobody has looked yet" is
 * the absence of a state, and giving it a hue would make an untouched queue look
 * like something was wrong.
 */
const VARIANT: Record<ComplaintStatusView, "outline" | "warning" | "success" | "destructive"> = {
  PENDING: "outline",
  UNDER_REVIEW: "warning",
  RESOLVED: "success",
  REJECTED: "destructive",
};

export function ComplaintStatusBadge({ status }: { status: ComplaintStatusView }) {
  return <Badge variant={VARIANT[status]}>{complaintStatusLabel(status)}</Badge>;
}
