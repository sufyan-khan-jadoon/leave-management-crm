import { handleRoute, ok, parseBody } from "@/lib/api";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { resendOtpSchema } from "@/validations/auth.schema";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const input = await parseBody(request, resendOtpSchema);

    enforceRateLimit(rateLimitKey("resend-otp", request), RATE_LIMITS.resendOtp);
    enforceRateLimit(rateLimitKey("resend-otp-email", request, input.email), RATE_LIMITS.resendOtp);

    const result = await authService.resendOtp(input.email);

    return ok({
      cooldownSeconds: result.cooldownSeconds,
      message: "If that address needs verification, a new code is on its way.",
    });
  });
}
