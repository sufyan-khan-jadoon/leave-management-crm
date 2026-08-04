import { created, handleRoute, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { ForbiddenError } from "@/lib/errors";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { ROLE } from "@/lib/enums";
import { leaveService } from "@/services/leave.service";
import { aiLeaveRequestSchema } from "@/validations/leave.schema";

/**
 * Natural-language leave submission.
 *
 * The request body is passed to Groq for extraction and then discarded — only
 * the resulting date and reason are persisted.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();

    if (user.role === ROLE.ADMIN) {
      throw new ForbiddenError("Administrators submit leave from an employee account.");
    }

    if (!user.profileComplete) {
      throw new ForbiddenError("Complete your profile before submitting a leave request.");
    }

    // Keyed by user rather than IP: the cost being protected is the AI quota.
    enforceRateLimit(rateLimitKey("ai-leave", request, user.id), RATE_LIMITS.aiLeave);

    const { message } = await parseBody(request, aiLeaveRequestSchema);
    const decision = await leaveService.createFromNaturalLanguage(user.id, message);

    return created(decision);
  });
}
