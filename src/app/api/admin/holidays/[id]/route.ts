import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeHoliday } from "@/lib/serialize";
import { holidayService } from "@/services/holiday.service";
import { updateHolidaySchema } from "@/validations/holiday.schema";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;
    const input = await parseBody(request, updateHolidaySchema);

    const holiday = await holidayService.update(user, id, input);

    return ok(serializeHoliday(holiday));
  });
}

export async function DELETE(_request: Request, { params }: Context) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;

    const holiday = await holidayService.remove(user, id);

    return ok({ id: holiday.id });
  });
}
