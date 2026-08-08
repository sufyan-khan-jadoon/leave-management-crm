import { handleRoute, ok } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { UnauthorizedError } from "@/lib/errors";
import { attendanceWarningService } from "@/services/attendance-warning.service";

/**
 * Never prerendered and never cached: a sweep has to actually run on every call,
 * and a cached 200 would silently stop anybody ever being warned.
 */
export const dynamic = "force-dynamic";

/**
 * Warns everyone who missed today's attendance deadline.
 *
 * Driven by Vercel Cron (see `vercel.json`) at 17:05 on the company's clock,
 * five minutes after the default 5 PM cutoff, so a slightly late firing still
 * catches the day and an early one cannot warn people who have time left.
 *
 * The sweep decides for itself whether the deadline has passed, rather than
 * trusting the schedule to mean it has — the cutoff is a setting the super admin
 * can move, and a cron line cannot follow it. That also makes the frequency a
 * knob rather than a correctness question: each letter is claimed before it is
 * written, so running this hourly on a paid plan is indistinguishable from
 * running it once.
 *
 * Fails closed. With no `CRON_SECRET` configured it refuses everyone, rather
 * than becoming an open trigger for mailing warning letters to the organisation.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const secret = serverEnv().CRON_SECRET;
    const presented = request.headers.get("authorization");

    if (!secret || presented !== `Bearer ${secret}`) {
      throw new UnauthorizedError("This endpoint is not callable directly.");
    }

    const sweep = await attendanceWarningService.dispatch();

    // Worth a line even when it does nothing: "before-cutoff" is how you tell a
    // sweep that ran and declined from one that never ran at all.
    console.info("[cron] Attendance warnings:", sweep);

    return ok(sweep);
  });
}
