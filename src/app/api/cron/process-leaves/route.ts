import { handleRoute, ok } from "@/lib/api";
import { ForbiddenError } from "@/lib/errors";
import { serverEnv } from "@/lib/env";
import { leaveService } from "@/services/leave.service";

/**
 * Scheduled decision pass.
 *
 * Vercel Hobby caps cron at one run per day, which cannot honour a five-minute
 * delay, so this is driven by an external scheduler instead. It carries no user
 * session — the shared secret is the only thing standing between the internet
 * and a job that approves leave, so an absent or mismatched header is refused.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const expected = serverEnv().CRON_SECRET;
    const provided = request.headers.get("authorization");

    if (provided !== `Bearer ${expected}`) {
      throw new ForbiddenError("Invalid cron credentials.");
    }

    const result = await leaveService.processDueDecisions();

    return ok(result);
  });
}
