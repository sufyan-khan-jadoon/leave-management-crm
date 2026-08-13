import { failure, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { friendlyTimeLabel } from "@/lib/attendance-policy";
import { toIsoDate } from "@/lib/date";
import { AppError } from "@/lib/errors";
import { formatDistance } from "@/lib/geo";
import { attendanceService, lateMinutesOf } from "@/services/attendance.service";
import { attendanceRosterQuerySchema } from "@/validations/attendance.schema";

/** Streams the day's roster as CSV, matching whatever is filtered on screen. */
export async function GET(request: Request) {
  try {
    const user = await requireAdmin();
    const query = parseQuery(request, attendanceRosterQuerySchema);

    // Page size is overridden rather than honoured: an export of "page 1 of the
    // roster" is not what anybody means by exporting the roster.
    //
    // The caller goes with it, so `population` is judged here exactly as it is
    // on screen. An export that took the filter but not the check would be the
    // easier of the two to reach with a hand-written URL.
    const roster = await attendanceService.roster({ ...query, page: 1, pageSize: 10_000 }, user);

    // `Recorded by` and `Reason` carry the distinction into the spreadsheet,
    // where it matters most: an export is what gets mailed around and archived,
    // and a manually recorded day that looked identical to a geofenced one would
    // erase the difference exactly where nobody can check it against the screen.
    // A proved check-in leaves both blank, so the columns read as the exception
    // they are.
    const header = [
      "Date",
      "Employee",
      "Email",
      "Department",
      "Position",
      "Status",
      "Check-in",
      // Both the figure and the deadline it was judged against, because a
      // spreadsheet outlives the setting: "15" alone becomes unreadable the day
      // somebody moves the cutoff, and this is the column an argument about
      // somebody's timekeeping would be had over.
      "Late (minutes)",
      "Late measured from",
      "Distance",
      "GPS accuracy",
      "Recorded by",
      "Reason",
    ];

    const rows = roster.items.map((entry) => {
      const record = entry.attendance;
      // Null distance means nobody measured one — the day was vouched for rather
      // than proved. `formatDistance` is never handed a fabricated zero.
      const geo = record && record.distanceMeters !== null && record.accuracyMeters !== null;

      return [
        toIsoDate(roster.date),
        entry.employee.name,
        entry.employee.email,
        entry.employee.department ?? "",
        entry.employee.position ?? "",
        entry.status,
        record ? record.checkInAt.toISOString() : "",
        record ? String(lateMinutesOf(record)) : "",
        record ? friendlyTimeLabel(record.lateBasisMinutes) : "",
        geo ? formatDistance(record.distanceMeters!) : "",
        geo ? formatDistance(record.accuracyMeters!) : "",
        record?.markedBy?.name ?? "",
        record?.reason ?? "",
      ];
    });

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
