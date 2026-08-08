import { handleRoute, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { serializeAttendanceToday, serializeHoliday } from "@/lib/serialize";
import { attendanceService } from "@/services/attendance.service";
import { employeeService } from "@/services/employee.service";
import { holidayService } from "@/services/holiday.service";
import { leaveService } from "@/services/leave.service";

/** Everything the employee dashboard needs, in a single round trip. */
export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();

    const [employee, balance, counts, trend, recent, closures, today, presentThisMonth] =
      await Promise.all([
        employeeService.byId(user.id),
        leaveService.balanceFor(user.id),
        leaveService.lifetimeCounts(user.id),
        leaveService.monthlyTrend(6, { employeeId: user.id }),
        leaveService.list({
          employeeId: user.id,
          page: 1,
          pageSize: 5,
          sortBy: "leaveDate",
          sortDir: "desc",
        }),
        // Read for everyone, not only administrators: a closure is a fact about
        // the calendar, and the person most affected by it is the one deciding
        // whether to spend a leave day next week.
        holidayService.upcoming(3),
        // Carried in the same payload rather than fetched separately, so the
        // dashboard still opens in one round trip and "am I marked in yet" is
        // answered before anything has to load.
        attendanceService.todayFor(user.id),
        attendanceService.presentThisMonth(user.id),
      ]);

    return ok({
      employee,
      balance,
      counts,
      trend,
      recentLeaves: recent.items,
      totalLeaves: recent.total,
      upcomingClosures: closures.map(serializeHoliday),
      attendance: {
        today: serializeAttendanceToday(today),
        presentThisMonth,
      },
    });
  });
}
