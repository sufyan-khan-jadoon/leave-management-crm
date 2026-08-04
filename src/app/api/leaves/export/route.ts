import { requireUser } from "@/lib/auth/guards";
import { failure, parseQuery } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { isAdminRole } from "@/lib/enums";
import { toIsoDate, toUtcDay } from "@/lib/date";
import { leaveService } from "@/services/leave.service";
import { leaveQuerySchema } from "@/validations/leave.schema";

/**
 * Streams the filtered leave history as CSV.
 *
 * Employees receive only their own rows; admins receive everything matching the
 * current filters.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const query = parseQuery(request, leaveQuerySchema);
    const isAdmin = isAdminRole(user.role);

    const leaves = await leaveService.listAll({
      ...query,
      employeeId: isAdmin ? query.employeeId : user.id,
      from: query.from ? toUtcDay(query.from) : undefined,
      to: query.to ? toUtcDay(query.to) : undefined,
    });

    const header = ["Leave Date", "Employee", "Email", "Department", "Position", "Reason", "Status", "Requested On"];

    const rows = leaves.map((leave) => [
      toIsoDate(leave.leaveDate),
      leave.employee.name,
      leave.employee.email,
      leave.employee.department ?? "",
      leave.employee.position ?? "",
      leave.reason,
      leave.status,
      leave.createdAt.toISOString(),
    ]);

    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const filename = `leave-history-${toIsoDate(new Date())}.csv`;

    // The BOM makes Excel honour UTF-8 for non-ASCII names.
    return new Response(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof AppError) return failure(error);

    console.error("[api] Leave export failed:", error);
    return new Response("Export failed", { status: 500 });
  }
}

/**
 * Quotes a CSV cell and neutralises spreadsheet formula injection: a leading
 * =, +, - or @ is prefixed with an apostrophe so Excel treats it as text.
 */
function escapeCsvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
