import { handleRoute, ok } from "@/lib/api";
import { serverEnv } from "@/lib/env";
import { UnauthorizedError } from "@/lib/errors";
import { holidayService } from "@/services/holiday.service";

/**
 * Never prerendered and never cached: a swept announcement must actually run
 * on every call, and a cached 200 would silently stop the office ever being
 * told anything.
 */
export const dynamic = "force-dynamic";

/**
 * Makes every office-closed announcement whose moment has arrived.
 *
 * Driven by Vercel Cron (see `vercel.json`), which runs it hourly and presents
 * `CRON_SECRET` as a bearer token. Hourly rather than at noon exactly, because a
 * single daily firing that happens to fail is a whole company not told; the
 * sweep claims each row before sending, so running it twelve times over is
 * indistinguishable from running it once.
 *
 * Fails closed. With no `CRON_SECRET` configured the endpoint refuses everyone,
 * rather than becoming an open trigger for mailing the entire organisation.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const secret = serverEnv().CRON_SECRET;
    const presented = request.headers.get("authorization");

    if (!secret || presented !== `Bearer ${secret}`) {
      throw new UnauthorizedError("This endpoint is not callable directly.");
    }

    const sweep = await holidayService.dispatchDueNotices();

    // Worth a line in the log even when it does nothing: "considered 0" is how
    // you tell a sweep that ran and found nothing from one that never ran.
    console.info("[cron] Office day-off notices:", sweep);

    return ok(sweep);
  });
}
