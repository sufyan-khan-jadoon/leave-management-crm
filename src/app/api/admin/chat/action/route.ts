import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { adminChatService } from "@/services/admin-chat.service";
import { adminChatActionSchema } from "@/validations/admin-chat.schema";

/**
 * Carries out an act the administrator approved in the assistant.
 *
 * **Separate from `/api/admin/chat` on purpose.** That endpoint answers questions
 * and writes nothing; this one is the only place the assistant can change
 * anything, so the two are told apart in the route table, in the logs, and by
 * anybody auditing what this feature is able to do. Overloading one endpoint with
 * both would make "the assistant is read-only except when it isn't" a fact you
 * could only establish by reading the service.
 *
 * **No AI call happens here.** The wording was interpreted when the proposal was
 * made; re-reading it to perform an act already agreed would be a second chance
 * to understand it differently — the same reason `resolved` short-circuits the
 * model on the read path, and the reason the leave assistant confirms against a
 * re-planned proposal rather than a sentence.
 *
 * `requireAdmin` gets a caller through the door, and nothing more: the real
 * authority is settled inside, where `employeeService.remove` applies
 * `assertMayManage` and `invitationService.invite` applies `assertMayInvite`,
 * both against the account read fresh from the database. So an ordinary
 * administrator cannot delete another administrator here any more than they can
 * from the Staff screen, and one without `canInviteEmployees` cannot onboard
 * anybody by asking nicely. This route deliberately adds no permission logic of
 * its own — a second copy is how the two come to disagree.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();

    enforceRateLimit(rateLimitKey("admin-chat-action", request, user.id), RATE_LIMITS.adminStaffAction);

    const action = await parseBody(request, adminChatActionSchema);
    const result = await adminChatService.execute({ id: user.id, role: user.role }, action);

    return ok(result);
  });
}
