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

/**
 * Consecutive failed sign-ins tolerated before an account is locked and has to
 * verify its email address again. Applies to every role, the super admin
 * included — a guessed password is no less dangerous for being a senior one.
 */
export const MAX_LOGIN_ATTEMPTS = 5;

export const OTP_LENGTH = 6;

/** How long an unaccepted invitation stays valid, whichever role it grants. */
export const INVITE_TTL_DAYS = 7;

/** Upper bound on a single request, so a slip of the tongue cannot book a year. */
export const MAX_LEAVE_DAYS_PER_REQUEST = 31;

/**
 * When the "office is closed tomorrow" announcement goes out: noon on the day
 * before, on the company's wall clock rather than the server's.
 */
export const HOLIDAY_NOTICE_HOUR = 12;

/** Enough for "Company retreat — Karachi office only", short of an essay. */
export const MAX_HOLIDAY_REASON_LENGTH = 120;

/** A subject line long enough to say something, short enough not to be truncated. */
export const MAX_EMAIL_SUBJECT_LENGTH = 150;

/**
 * Upper bound on a custom email body, counted as raw HTML.
 *
 * Generous, because the composer's markup inflates what somebody actually typed
 * — but bounded, because this string is held in memory once per recipient while
 * a send is in flight.
 */
export const MAX_EMAIL_BODY_LENGTH = 50_000;

/** How many files may ride along with one custom email. */
export const MAX_EMAIL_ATTACHMENTS = 5;

/**
 * The whole attachment budget for one message, across every file on it.
 *
 * **One budget, deliberately — not a per-file limit and a total.** Two numbers
 * would have to be kept in a sensible relation to each other, and the second one
 * is the only one that decides whether the message can actually leave: what the
 * mail host and the platform care about is the size of the request and the size
 * of the envelope, neither of which knows how many files it was divided into.
 *
 * 4 MB because the send is a plain route handler and Vercel refuses a request
 * body over 4.5 MB before any of this code runs — a limit chosen above that
 * would surface as an opaque platform error instead of the message below. It
 * also keeps the encoded message well inside the 25 MB most mail hosts accept,
 * since attachments go on the wire base64-encoded and grow by about a third.
 *
 * Counted in binary megabytes because that is what `formatFileSize` and every
 * operating system's file browser show: a limit that a sender's own machine
 * reports as 4 MB has to be 4 MB here too, or a file it calls 3.9 MB comes back
 * refused for being over 3.8.
 */
export const MAX_EMAIL_ATTACHMENT_BYTES = 4 * 1024 * 1024;

/**
 * How many people one custom email may reach in a single act.
 *
 * A guard against the send that was not meant to be organisation-wide, and
 * against a mail host's hourly cap being spent in one request. Reaching it is a
 * refusal with a number in it rather than a partial send, so nobody has to work
 * out which half of the company was written to.
 */
export const MAX_EMAIL_RECIPIENTS = 500;

/**
 * Where the office is. The single source of truth for attendance — nothing else
 * in the codebase names a coordinate.
 *
 * Moving the company means changing these three values and nothing else; every
 * check-in already recorded keeps the distance it was judged against, so history
 * does not silently re-decide itself around the new address.
 */
export const OFFICE_LOCATION = {
  latitude: 34.1751648,
  longitude: 73.2264346,
} as const;

/**
 * How close to `OFFICE_LOCATION` counts as being at the office.
 *
 * 100m, widened from an original 30m. Thirty metres was the building, and it was
 * the wrong thing to measure: a phone indoors falls back on wifi and cell
 * triangulation, which routinely reports a fix uncertain by 20–60m, and this
 * number is also the accuracy ceiling below — so people standing in the office
 * were turned away for having an ordinary indoor fix rather than for being
 * somewhere else. A hundred metres is the office and its immediate approach,
 * still far too small to reach anybody's home.
 *
 * It is the one number to change if that judgement turns out wrong; the ceiling
 * follows it automatically.
 */
export const ALLOWED_RADIUS_METERS = 100;

/**
 * The worst GPS uncertainty a reading may carry and still be believed.
 *
 * Pinned to the radius rather than chosen separately, and that equality is the
 * whole argument: a fix accurate to ±100m cannot tell "inside a 100m circle"
 * from "somewhere near it", so believing it would widen the geofence by exactly
 * the amount the reading is unsure by. Refusing instead keeps the fence where it
 * is and puts the cost on the one reading that could not be trusted.
 *
 * This is deliberately *not* added to the radius anywhere. A poor fix is a
 * reason to ask for a better one, never a reason to accept a wider circle.
 */
export const MAX_ACCURACY_METERS = ALLOWED_RADIUS_METERS;

/** How long to wait for the device to produce a fix before giving up. */
export const GEOLOCATION_TIMEOUT_MS = 15_000;

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
  adminRegister: "/admin/register",
  adminPending: "/admin/pending",
  adminDashboard: "/admin",
  adminEmployees: "/admin/employees",
  adminLeaves: "/admin/leaves",
  adminWorkingDays: "/admin/working-days",
  adminAttendance: "/admin/attendance",
  adminAssistant: "/admin/assistant",
  adminEmails: "/admin/emails",
  adminAccess: "/admin/access",
  attendance: "/attendance",
} as const;
