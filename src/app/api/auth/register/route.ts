import { created, handleRoute, parseBody } from "@/lib/api";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { registerSchema } from "@/validations/auth.schema";

export async function POST(request: Request) {
  return handleRoute(async () => {
    enforceRateLimit(rateLimitKey("register", request), RATE_LIMITS.register);

    const input = await parseBody(request, registerSchema);
    const result = await authService.register(input);

    return created({
      email: result.email,
      pendingApproval: result.pendingApproval,
      message: result.pendingApproval
        ? "Request received. Verify your email, then your super administrator will review it."
        : "Account created. Check your inbox for a 6-digit verification code.",
    });
  });
}
