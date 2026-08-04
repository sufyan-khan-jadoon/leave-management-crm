import { handleRoute, ok, parseBody } from "@/lib/api";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { resetPasswordSchema } from "@/validations/auth.schema";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const input = await parseBody(request, resetPasswordSchema);

    enforceRateLimit(rateLimitKey("reset-password", request), RATE_LIMITS.resetPassword);
    enforceRateLimit(rateLimitKey("reset-password-email", request, input.email), RATE_LIMITS.resetPassword);

    await authService.resetPassword(input);

    return ok({ message: "Your password has been changed. You can sign in now." });
  });
}
