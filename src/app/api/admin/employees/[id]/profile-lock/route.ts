import { z } from "zod";

import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { employeeService } from "@/services/employee.service";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * `strictObject` for the reason the attendance body is one: there is no field
 * here for a client verdict to land in, and a request carrying `profileLockedAt`
 * or an author is refused loudly rather than quietly stripped. Who locked it and
 * when are the server's to decide.
 */
const profileLockSchema = z.strictObject({
  locked: z.boolean(),
  /** Shown to the employee, so a frozen form explains itself. Blank means none. */
  reason: z
    .string()
    .trim()
    .max(200, "Keep the reason under 200 characters")
    .optional()
    .transform((value) => value || null),
});

/**
 * Freezes or releases an employee's own profile edits.
 *
 * Its own route rather than a field on the account `PATCH`, matching `status`
 * beside it: this is one act with one answer, not a partial edit of the record,
 * and keeping it separate means a body meant to rename somebody can never lock
 * them as a side effect.
 *
 * `requireAdmin` is the door; which accounts are actually reachable is
 * `assertMayManage` inside the service, so an ordinary administrator reaches
 * employees only and nobody reaches the owner.
 */
export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const { locked, reason } = await parseBody(request, profileLockSchema);

    const employee = await employeeService.setProfileLock(id, locked, admin, reason);

    return ok({ employee });
  });
}
