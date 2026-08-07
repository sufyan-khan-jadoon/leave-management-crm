import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { invitationService } from "@/services/invitation.service";
import { adminDecisionSchema } from "@/validations/invitation.schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const { id } = await params;
    const { approve } = await parseBody(request, adminDecisionSchema);

    return ok(await invitationService.decide(id, approve));
  });
}
