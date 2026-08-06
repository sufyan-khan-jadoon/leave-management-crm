import { handleRoute, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { inviteService } from "@/services/invite.service";

/**
 * Deletes a key nobody redeemed. Spent keys are refused — they are the record of
 * how an existing account was created. An admin may only delete employee keys
 * they issued; the service treats anything else as absent rather than forbidden,
 * so this cannot be used to probe for keys the caller is not allowed to see.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;

    return ok(await inviteService.discard(id, user));
  });
}
