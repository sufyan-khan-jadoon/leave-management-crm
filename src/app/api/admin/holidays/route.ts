import { created, handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeHoliday } from "@/lib/serialize";
import { holidayService } from "@/services/holiday.service";
import { createHolidaySchema } from "@/validations/holiday.schema";

/**
 * Guarded with the looser `requireAdmin` on purpose — the same shape the
 * invitation routes take. Whether this particular administrator may close the
 * office is settled in the service against the grant in the database, not here
 * against the role in the session.
 *
 * `canManage` rides along so the screen can hide a form it may not submit. It
 * mirrors the real check and never replaces it.
 */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireAdmin();

    const [holidays, canManage] = await Promise.all([
      holidayService.list(),
      holidayService.mayManage(user),
    ]);

    return ok({ holidays: holidays.map(serializeHoliday), canManage });
  });
}

export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, createHolidaySchema);

    const holiday = await holidayService.create(user, input);

    return created(serializeHoliday(holiday));
  });
}
