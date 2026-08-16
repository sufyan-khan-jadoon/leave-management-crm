import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { complaintService } from "@/services/complaint.service";
import { updateComplaintSchema } from "@/validations/complaint.schema";

/** One complaint in full, internal notes included. Behind `canManageComplaints`. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;

    return ok(await complaintService.find(user, id));
  });
}

/**
 * Moves a complaint's status, writes its resolution, or records internal notes.
 *
 * The one endpoint in the feature that changes anything, and the only place the
 * resolution email can originate. Who resolved it and when are written from the
 * session and the clock — the schema has no field for either, so an
 * administrator cannot credit a colleague with their decision.
 *
 * `notification` comes back on the response so the screen can say what actually
 * happened to the letter. A delivery failure is **not** an error here: the
 * complaint is resolved, that write succeeded, and reporting it as a failure
 * would invite somebody to press the button again. It is reported instead —
 * which is the whole reason the service returns it rather than swallowing it.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;
    const input = await parseBody(request, updateComplaintSchema);

    const { complaint, notification } = await complaintService.update(user, id, input);

    return ok({ complaint, notification });
  });
}
