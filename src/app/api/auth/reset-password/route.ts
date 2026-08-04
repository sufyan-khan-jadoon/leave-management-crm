import { cookies } from "next/headers";

import { handleRoute, ok, parseBody } from "@/lib/api";
import {
  RESET_TICKET_COOKIE,
  readResetTicket,
  resetTicketCookieOptions,
} from "@/lib/auth/reset-ticket";
import { ValidationError } from "@/lib/errors";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { resetPasswordSchema } from "@/validations/auth.schema";

/**
 * Final step of the reset. The account comes from the signed ticket rather than
 * the request body, so this cannot be pointed at someone else's account by
 * editing the payload.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const input = await parseBody(request, resetPasswordSchema);

    enforceRateLimit(rateLimitKey("reset-password", request), RATE_LIMITS.resetPassword);

    const store = await cookies();
    const ticket = await readResetTicket(store.get(RESET_TICKET_COOKIE)?.value);

    if (!ticket) {
      throw new ValidationError("That code has expired. Request a new one to continue.");
    }

    await authService.resetPassword(ticket, input.password);

    const response = ok({ message: "Your password has been changed. You can sign in now." });
    // The ticket is spent; drop it so a refresh cannot replay the request.
    response.cookies.set(RESET_TICKET_COOKIE, "", resetTicketCookieOptions(0));

    return response;
  });
}
