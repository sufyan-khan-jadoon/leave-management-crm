import { todayUtc } from "@/lib/date";
import { ConflictError, ForbiddenError, ValidationError } from "@/lib/errors";
import { judgePosition } from "@/lib/geo";
import {
  attendanceRepository,
  type AttendanceDto,
} from "@/repositories/attendance.repository";
import {
  employeeRepository,
  type AttendanceRosterMember,
} from "@/repositories/employee.repository";
import { holidayRepository } from "@/repositories/holiday.repository";
import { leaveRepository } from "@/repositories/leave.repository";
import type { MarkAttendanceInput, AttendanceRosterQuery } from "@/validations/attendance.schema";

/**
 * What one person's day amounts to.
 *
 * Derived on every read rather than stored, for the reason the holiday rules
 * give: a closure declared after the fact has to change what a past day meant,
 * and a stored ABSENT would have to be found and unwritten. Asking the question
 * makes that free — withdraw the closure and the day goes back to what it was.
 */
export type AttendanceDayStatus =
  /** Checked in from inside the geofence. */
  | "PRESENT"
  /** Approved leave on the day, so nobody was expecting them. */
  | "ON_LEAVE"
  /** The office was shut. Not a working day for anybody. */
  | "CLOSED"
  /** A working day, not on leave, and no check-in. */
  | "ABSENT"
  /** The day has not happened yet, so there is nothing to be absent from. */
  | "UPCOMING";

export type RosterEntry = {
  employee: AttendanceRosterMember;
  status: AttendanceDayStatus;
  attendance: AttendanceDto | null;
};

export type TodayState = {
  date: Date;
  attendance: AttendanceDto | null;
  status: AttendanceDayStatus;
  /** Whether the "Mark present" button has anything to do. */
  canMark: boolean;
  /** Why not, when it cannot — shown instead of the button. */
  blockedReason: string | null;
};

export type MarkResult = {
  attendance: AttendanceDto;
  /** True when the row was already there; nothing new was written. */
  alreadyMarked: boolean;
};

/** The refusals, in the words the employee sees. */
const OUTSIDE_MESSAGE =
  "You are outside the office location. Attendance can only be marked from the office.";

const INACCURATE_MESSAGE =
  "Unable to verify your location accurately. Please move to an area with better location accuracy and try again.";

/**
 * Whether the office was open on a date.
 *
 * `closedDatesAmong` is the single question, and it is asked *before* anything
 * decides present or absent rather than alongside it — a closed day is not a
 * working day, so there is nothing for attendance to say about it.
 */
async function officeClosedOn(date: Date): Promise<boolean> {
  const closed = await holidayRepository.closedDatesAmong([date]);
  return closed.length > 0;
}

function describeDay(options: {
  attendance: AttendanceDto | null;
  officeClosed: boolean;
  onLeave: boolean;
  isFuture: boolean;
}): AttendanceDayStatus {
  // Order matters. A check-in that exists is a fact about the day and outranks
  // anything derived — including a closure declared afterwards, which would
  // otherwise erase the record of somebody who did come in.
  if (options.attendance) return "PRESENT";
  if (options.officeClosed) return "CLOSED";
  if (options.onLeave) return "ON_LEAVE";
  return options.isFuture ? "UPCOMING" : "ABSENT";
}

export const attendanceService = {
  /**
   * Marks somebody present, if the office agrees they are standing in it.
   *
   * The client sends three numbers and no opinion: latitude, longitude and how
   * sure the device is. Everything after that is decided here — the distance is
   * computed server-side against `OFFICE_LOCATION`, and a body carrying its own
   * `distance` or `isInsideOffice` is refused by the schema before it arrives.
   *
   * Idempotent on purpose. A second tap returns the check-in already recorded
   * rather than an error, because "you are already marked present, at 9:12" is
   * the answer to what was being asked, not a failure to do it.
   */
  async markPresent(employeeId: string, input: MarkAttendanceInput): Promise<MarkResult> {
    const date = todayUtc();

    // Asked first: on a closed day there is no attendance to take, so judging
    // the position at all would be answering a question nobody asked.
    if (await officeClosedOn(date)) {
      throw new ConflictError(
        "The office is closed today, so there is no attendance to mark. The day costs nobody a leave.",
      );
    }

    const existing = await attendanceRepository.findByEmployeeAndDate(employeeId, date);
    if (existing) return { attendance: existing, alreadyMarked: true };

    const verdict = judgePosition(input);

    if (!verdict.allowed) {
      // A vague fix is a request to try again, not an accusation of being
      // elsewhere — the server genuinely does not know which it is. Told apart
      // by status too: 422 asks for better input, 403 is a real refusal.
      if (verdict.reason === "inaccurate") throw new ValidationError(INACCURATE_MESSAGE);
      throw new ForbiddenError(OUTSIDE_MESSAGE);
    }

    const attendance = await attendanceRepository.create({
      employeeId,
      date,
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      distanceMeters: verdict.distanceMeters,
    });

    // Null means the unique index refused it: another tap landed between the
    // read above and this write. The row that won is the answer.
    if (!attendance) {
      const winner = await attendanceRepository.findByEmployeeAndDate(employeeId, date);
      if (winner) return { attendance: winner, alreadyMarked: true };

      throw new ConflictError("Couldn't record that check-in. Please try again.");
    }

    return { attendance, alreadyMarked: false };
  },

  /** Where one person stands today — what the attendance screen opens on. */
  async todayFor(employeeId: string): Promise<TodayState> {
    const date = todayUtc();

    const [attendance, officeClosed, onLeaveIds] = await Promise.all([
      attendanceRepository.findByEmployeeAndDate(employeeId, date),
      officeClosedOn(date),
      leaveRepository.employeeIdsOnApprovedLeave(date),
    ]);

    const onLeave = onLeaveIds.includes(employeeId);
    const status = describeDay({ attendance, officeClosed, onLeave, isFuture: false });

    const blockedReason = attendance
      ? null
      : officeClosed
        ? "The office is closed today. Nobody is expected in, and the day costs nobody a leave."
        : onLeave
          ? "You are on approved leave today, so there is no attendance to mark."
          : null;

    return {
      date,
      attendance,
      status,
      canMark: !attendance && !officeClosed && !onLeave,
      blockedReason,
    };
  },

  listForEmployee(employeeId: string, page: number, pageSize: number) {
    return attendanceRepository.listForEmployee(employeeId, page, pageSize);
  },

  /**
   * Everyone expected in on one date, and whether they came.
   *
   * Day-centric because absence only exists per day per person: there is no row
   * to page through, so the roster is built by asking who was expected and
   * subtracting who checked in.
   *
   * The roster is fetched whole and paged in memory. That is deliberate — an
   * office is tens to low hundreds of people, and the status a row is filtered
   * on does not exist in the database to filter by. Paging in SQL first would
   * mean "show me today's absentees" returning a page of whoever happened to
   * sort first, most of whom were present.
   */
  async roster(query: AttendanceRosterQuery): Promise<{
    date: Date;
    officeClosed: boolean;
    items: RosterEntry[];
    total: number;
    summary: { expected: number; present: number; absent: number; onLeave: number };
  }> {
    const date = query.date ?? todayUtc();
    const isFuture = date.getTime() > todayUtc().getTime();

    const [members, records, officeClosed, onLeaveIds] = await Promise.all([
      employeeRepository.listAttendanceRoster({
        employeeId: query.employeeId,
        department: query.department,
        search: query.search,
      }),
      attendanceRepository.listOnDate(date),
      officeClosedOn(date),
      leaveRepository.employeeIdsOnApprovedLeave(date),
    ]);

    const byEmployee = new Map(records.map((record) => [record.employeeId, record]));
    const onLeave = new Set(onLeaveIds);

    const entries: RosterEntry[] = members.map((employee) => {
      const attendance = byEmployee.get(employee.id) ?? null;

      return {
        employee,
        attendance,
        status: describeDay({
          attendance,
          officeClosed,
          onLeave: onLeave.has(employee.id),
          isFuture,
        }),
      };
    });

    // Counted over everyone matching the filters, not the page on screen, so
    // the tiles keep meaning the same thing on page two.
    const summary = {
      expected: entries.length,
      present: entries.filter((entry) => entry.status === "PRESENT").length,
      absent: entries.filter((entry) => entry.status === "ABSENT").length,
      onLeave: entries.filter((entry) => entry.status === "ON_LEAVE").length,
    };

    const filtered = query.status === "ALL" ? entries : entries.filter((e) => e.status === query.status);
    const start = (query.page - 1) * query.pageSize;

    return {
      date,
      officeClosed,
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      summary,
    };
  },
};
