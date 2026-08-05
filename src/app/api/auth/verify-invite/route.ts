import { handleRoute, ok, parseBody } from "@/lib/api";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { inviteService } from "@/services/invite.service";
import { verifyInviteSchema } from "@/validations/invite.schema";

/**
 * Checks an invite key before the sign-up fields are shown.
 *
 * The key is not spent here — registration re-checks and redeems it — so
 * abandoning the form leaves it usable. Rate limited because this is the one
 * endpoint that will tell an anonymous caller whether a key is real.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const { inviteKey } = await parseBody(request, verifyInviteSchema);

    enforceRateLimit(rateLimitKey("verify-invite", request), RATE_LIMITS.verifyInvite);

    const invite = await inviteService.assertUsable(inviteKey);

    return ok({ valid: true, label: invite.label });
  });
}
