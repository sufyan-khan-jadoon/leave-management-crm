import { handleRoute, ok, parseBody } from "@/lib/api";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { forgotPasswordSchema } from "@/validations/auth.schema";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const input = await parseBody(request, forgotPasswordSchema);

    enforceRateLimit(rateLimitKey("forgot-password", request), RATE_LIMITS.forgotPassword);
    enforceRateLimit(rateLimitKey("forgot-password-email", request, input.email), RATE_LIMITS.forgotPassword);

    await authService.requestPasswordReset(input.email);

    // Deliberately identical whether or not the address exists.
    return ok({ message: "If an account exists for that address, a reset code is on its way." });
  });
}
