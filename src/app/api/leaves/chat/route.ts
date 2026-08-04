import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isAdminRole } from "@/lib/enums";
import { leaveChatService } from "@/services/leave-chat.service";
import { leaveChatSchema } from "@/validations/leave.schema";

/**
 * One turn of the leave assistant.
 *
 * Answers only; nothing is booked here. When the request is complete the reply
 * carries a proposal the employee has to confirm through /chat/confirm.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();

    if (isAdminRole(user.role)) {
      throw new ForbiddenError("Administrators submit leave from an employee account.");
    }

    if (!user.profileComplete) {
      throw new ForbiddenError("Complete your profile before requesting leave.");
    }

    // Keyed by user rather than IP: the cost being protected is the AI quota.
    enforceRateLimit(rateLimitKey("leave-chat", request, user.id), RATE_LIMITS.aiLeave);

    const { messages } = await parseBody(request, leaveChatSchema);
    const result = await leaveChatService.respond(user.id, messages);

    return ok(result);
  });
}
