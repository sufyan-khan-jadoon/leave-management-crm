import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { attendanceService } from "@/services/attendance.service";
import { attendanceEditQuerySchema } from "@/validations/attendance-edit.schema";

/**
 * Who changed what, for whom, and when.
 *
 * **Super admin only, and gated right here** — deliberately unlike almost every
 * other admin surface in this codebase, which guards with the looser
 * `requireAdmin` and settles the real question in a service against a delegable
 * grant. There is no delegable half to settle: this log is oversight *of the
 * administrators*, and an administrator who could read it would be auditing
 * themselves. `canEditHistoricalAttendance` buys the ability to make a
 * correction, never the ability to review everybody else's.
 *
 * The reset endpoint takes the same shape and for the same reason — some things
 * are the owner's because there is nobody else left to check them.
 *
 * A `GET` that writes nothing, with every filter optional. An empty query is the
 * whole log newest-first, which is what the screen opens on.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    await requireSuperAdmin();
    const query = parseQuery(request, attendanceEditQuerySchema);

    const { items, total } = await attendanceService.listEdits(query);

    return ok({
      items: items.map((edit) => ({
        id: edit.id,
        // The attendance date, at UTC midnight like every calendar day here.
        date: edit.date.toISOString(),
        previousStatus: edit.previousStatus,
        newStatus: edit.newStatus,
        // Null for every one-click correction, which is most of them. Where it
        // is set it is the only part of the row somebody typed.
        note: edit.note,
        editorRole: edit.editorRole,
        // When the correction was made — a different question from `date`, and
        // the one this screen is ordered by.
        createdAt: edit.createdAt.toISOString(),
        employee: edit.employee,
        // Null once the administrator's account has been deleted. The row
        // survives it, which is the whole reason `editedById` is `SetNull`.
        editedBy: edit.editedBy,
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  });
}
