import { handleRoute, ok, parseBody } from "@/lib/api";
import {
  RESET_TICKET_COOKIE,
  RESET_TICKET_MAX_AGE,
  resetTicketCookieOptions,
  signResetTicket,
} from "@/lib/auth/reset-ticket";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { verifyOtpSchema } from "@/validations/auth.schema";

/**
 * Second step of the reset: confirms the code and hands back a signed ticket so
 * the password page can prove the check happened. The code itself is not spent
 * here — abandoning the flow leaves it usable until it expires.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const input = await parseBody(request, verifyOtpSchema);

    enforceRateLimit(rateLimitKey("verify-reset-code", request), RATE_LIMITS.resetPassword);
    enforceRateLimit(rateLimitKey("verify-reset-code-email", request, input.email), RATE_LIMITS.resetPassword);

    const ticket = await authService.verifyResetCode(input);
    const token = await signResetTicket(ticket);

    const response = ok({ email: ticket.email, message: "Code verified. Choose a new password." });
    response.cookies.set(RESET_TICKET_COOKIE, token, resetTicketCookieOptions(RESET_TICKET_MAX_AGE));

    return response;
  });
}
