import { handleRoute, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { complaintService } from "@/services/complaint.service";

/**
 * One of the caller's own complaints.
 *
 * There is deliberately **no PATCH or DELETE here.** An employee cannot change
 * their complaint's status, withdraw it, or edit what they wrote once it is
 * filed — the first would let somebody resolve their own grievance, and the
 * others would let a complaint be rewritten after an administrator had read and
 * acted on it. The absence of the verb is the enforcement; there is no handler
 * to reach.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;

    return ok(await complaintService.findMine(user, id));
  });
}
