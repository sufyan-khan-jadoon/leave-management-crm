import { handleRoute, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { complaintService } from "@/services/complaint.service";

/**
 * One attachment's bytes.
 *
 * Its own endpoint rather than a field on the complaint, because the payload is
 * a data URL measured in megabytes and no list should ever carry one. The
 * permission is re-derived from the complaint it hangs off — see
 * `complaintService.attachment` — so an attachment id is not a bearer token for
 * a file somebody uploaded as evidence in a grievance.
 *
 * Answers JSON rather than the raw bytes: the payload is already a `data:` URL,
 * so the browser can render or download it directly, and streaming it as a
 * binary response would mean decoding on the server to re-encode on the wire.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { id } = await params;

    return ok(await complaintService.attachment(user, id));
  });
}
