import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { changePasswordSchema } from "@/validations/auth.schema";

/**
 * Changes your own password.
 *
 * Guarded with `requireUser` alone: every account owns its own password, so
 * there is no seniority question here of the kind `assertMayManage` settles for
 * acting on somebody else's. The account is taken from the session and never
 * from the body, so this cannot be aimed at anyone but the caller.
 */
export async function PUT(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();

    enforceRateLimit(rateLimitKey("change-password", request, user.id), RATE_LIMITS.changePassword);

    const { currentPassword, password } = await parseBody(request, changePasswordSchema);
    await authService.changePassword(user.id, currentPassword, password);

    return ok({ changed: true });
  });
}
