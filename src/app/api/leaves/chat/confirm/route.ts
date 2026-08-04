import { created, handleRoute, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { ROLE } from "@/lib/enums";
import { leaveChatService } from "@/services/leave-chat.service";
import { leaveConfirmSchema } from "@/validations/leave.schema";

/**
 * Books a proposal the employee confirmed.
 *
 * The proposal is re-planned from scratch rather than trusted, so an edited
 * payload, a stale tab, or an allowance used up in the meantime is caught here
 * and refused with a conflict.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();

    if (user.role === ROLE.ADMIN) {
      throw new ForbiddenError("Administrators submit leave from an employee account.");
    }

    if (!user.profileComplete) {
      throw new ForbiddenError("Complete your profile before requesting leave.");
    }

    enforceRateLimit(rateLimitKey("leave-confirm", request, user.id), RATE_LIMITS.aiLeave);

    const proposal = await parseBody(request, leaveConfirmSchema);
    const result = await leaveChatService.confirm(user.id, { ...proposal, dates: [], remainingAfter: 0 });

    return created(result);
  });
}
