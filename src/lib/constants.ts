/** Maximum number of leaves the system will auto-approve in a calendar month. */
export const MONTHLY_LEAVE_ALLOWANCE = 4;

/** Lifetime of an email-verification OTP. */
export const OTP_TTL_MINUTES = 10;

/** Minimum wait before a user may request a fresh OTP. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Wrong-code submissions tolerated per OTP before it is invalidated. */
export const OTP_MAX_ATTEMPTS = 5;

export const OTP_LENGTH = 6;

/**
 * How long a request waits before the system decides it.
 *
 * There is no stored deadline: a request is due once `createdAt` is this far in
 * the past. That works because PENDING is only ever reached by this queue —
 * admins may set APPROVED or REJECTED but never PENDING.
 */
export const LEAVE_AUTO_APPROVAL_DELAY_MINUTES = 5;

/** Verbatim response required when an employee exceeds their monthly allowance. */
export function quotaExceededMessage(hrPhone: string): string {
  return `You have already used the maximum of ${MONTHLY_LEAVE_ALLOWANCE} approved leaves this month. Please contact HR at ${hrPhone} for further assistance.`;
}

/** Shown the moment a request is accepted into the approval queue. */
export function leavePendingMessage(): string {
  return "Your leave approval is pending. You will be informed when it is approved via your registered email.";
}

export const DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Quality Assurance",
  "Human Resources",
  "Finance",
  "Sales",
  "Marketing",
  "Customer Support",
  "Operations",
] as const;

export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  profileSetup: "/profile/setup",
  dashboard: "/dashboard",
  leaves: "/leaves",
  newLeave: "/leaves/new",
  profile: "/profile",
  adminLogin: "/admin/login",
  adminDashboard: "/admin",
  adminEmployees: "/admin/employees",
  adminLeaves: "/admin/leaves",
} as const;
