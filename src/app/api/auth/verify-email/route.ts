import { handleRoute, ok, parseBody } from "@/lib/api";
import { EMPLOYEE_STATUS } from "@/lib/enums";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authService } from "@/services/auth.service";
import { verifyOtpSchema } from "@/validations/auth.schema";

export async function POST(request: Request) {
  return handleRoute(async () => {
    const input = await parseBody(request, verifyOtpSchema);

    // Limit per-address as well as per-IP so a shared NAT cannot lock out
    // unrelated users, and a single account cannot be brute-forced from many IPs.
    enforceRateLimit(rateLimitKey("verify-otp", request), RATE_LIMITS.verifyOtp);
    enforceRateLimit(rateLimitKey("verify-otp-email", request, input.email), RATE_LIMITS.verifyOtp);

    const employee = await authService.verifyEmail(input);

    const pendingApproval = employee.status === EMPLOYEE_STATUS.PENDING_APPROVAL;

    return ok({
      email: employee.email,
      pendingApproval,
      message: pendingApproval
        ? "Email verified. Your request has been sent to the super administrator for approval."
        : "Email verified. You can sign in now.",
    });
  });
}
