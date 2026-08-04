/**
 * The company's wall clock.
 *
 * Leave dates are stored as UTC midnight, but "today" has to mean today where
 * the employee is. Deriving it from UTC put the app a day behind for the five
 * hours after local midnight, since Pakistan is UTC+5 and the server runs in
 * UTC. Change this one value to move the app to another office.
 */
export const APP_TIME_ZONE = "Asia/Karachi";

/** Maximum number of leaves the system will auto-approve in a calendar month. */
export const MONTHLY_LEAVE_ALLOWANCE = 4;

/** Lifetime of an email-verification OTP. */
export const OTP_TTL_MINUTES = 10;

/** Minimum wait before a user may request a fresh OTP. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

/** Wrong-code submissions tolerated per OTP before it is invalidated. */
export const OTP_MAX_ATTEMPTS = 5;

export const OTP_LENGTH = 6;

/** Upper bound on a single request, so a slip of the tongue cannot book a year. */
export const MAX_LEAVE_DAYS_PER_REQUEST = 31;

/** Sent whenever a request cannot fit inside the monthly allowance. */
export function quotaExceededMessage(hrPhone: string, hrName: string): string {
  return `I'm sorry — you can't have more than ${MONTHLY_LEAVE_ALLOWANCE} leaves per month. Please contact HR, ${hrName}, on ${hrPhone}.`;
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

/** Cookie holding proof that a reset code was verified. */
export const RESET_TICKET_COOKIE = "leave_crm_reset";

export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  verifyResetCode: "/verify-code",
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
