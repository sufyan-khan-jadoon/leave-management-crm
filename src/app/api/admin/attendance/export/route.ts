import { failure, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { toIsoDate } from "@/lib/date";
import { AppError } from "@/lib/errors";
import { formatDistance } from "@/lib/geo";
import { attendanceService } from "@/services/attendance.service";
import { attendanceRosterQuerySchema } from "@/validations/attendance.schema";

/** Streams the day's roster as CSV, matching whatever is filtered on screen. */
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const query = parseQuery(request, attendanceRosterQuerySchema);

    // Page size is overridden rather than honoured: an export of "page 1 of the
    // roster" is not what anybody means by exporting the roster.
    const roster = await attendanceService.roster({ ...query, page: 1, pageSize: 10_000 });

    const header = [
      "Date",
      "Employee",
      "Email",
      "Department",
      "Position",
      "Status",
      "Check-in",
      "Distance",
      "GPS accuracy",
    ];

    const rows = roster.items.map((entry) => [
      toIsoDate(roster.date),
      entry.employee.name,
      entry.employee.email,
      entry.employee.department ?? "",
      entry.employee.position ?? "",
      entry.status,
      entry.attendance ? entry.attendance.checkInAt.toISOString() : "",
      entry.attendance ? formatDistance(entry.attendance.distanceMeters) : "",
      entry.attendance ? formatDistance(entry.attendance.accuracyMeters) : "",
    ]);

    const csv = [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
    const filename = `attendance-${toIsoDate(roster.date)}.csv`;

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

    console.error("[api] Attendance export failed:", error);
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
