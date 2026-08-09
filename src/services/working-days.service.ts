import { ValidationError } from "@/lib/errors";
import {
  countWorkingDays,
  isWorkingDay,
  makeSchedule,
  splitByDayKind,
  weeklyOffDays,
  workingDaysBetween,
  type DaySplit,
  type IsoWeekday,
  type WorkingSchedule,
} from "@/lib/working-days";
import { addUtcDays } from "@/lib/date";
import {
  attendancePolicyRepository,
  type AttendancePolicyDto,
} from "@/repositories/attendance-policy.repository";
import { holidayRepository } from "@/repositories/holiday.repository";
import type { UpdateWorkingWeekInput } from "@/validations/working-days.schema";

/** The weekly schedule, as the settings screen reads it back. */
export type WorkingWeek = {
  workingDays: number[];
  daysOff: IsoWeekday[];
  updatedAt: Date;
  updatedBy: { id: string; name: string; email: string } | null;
};

function toWorkingWeek(policy: AttendancePolicyDto): WorkingWeek {
  return {
    workingDays: [...policy.workingDays].sort((a, b) => a - b),
    daysOff: weeklyOffDays(policy.workingDays),
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
  };
}

/**
 * The organisation's working schedule, and every question that depends on it.
 *
 * One service so that "is this a working day?" is answered in one place. Leave
 * duration, the attendance roster and the warning sweep all come through here;
 * none of them decides for itself which days count, and none of them reads
 * `holidays` and the weekly configuration separately and risks combining them
 * differently.
 *
 * A schedule is always fetched for a *span*: the weekly configuration is one
 * small row, but the closures are per-date, so pulling "all of them" to judge
 * four days would get slower every year the company operates. `scheduleFor` and
 * `scheduleBetween` each take exactly the closures they need, in one query.
 *
 * Reading is open to anybody signed in — an employee's leave form has to know
 * which days count. Writing the weekly configuration is the super admin's
 * alone and is gated in the route, the same split the attendance policy uses.
 */
export const workingDaysService = {
  /**
   * A schedule covering exactly these dates.
   *
   * The shape leave uses: it already holds the days it is about to judge, so
   * asking about a range it does not care about would be wasted work.
   */
  async scheduleFor(dates: readonly Date[]): Promise<WorkingSchedule> {
    const [policy, closedDates] = await Promise.all([
      attendancePolicyRepository.get(),
      holidayRepository.closedDatesAmong([...dates]),
    ]);

    return makeSchedule(policy.workingDays, closedDates);
  },

  /**
   * A schedule covering an inclusive date range.
   *
   * `closedDatesBetween` is half-open, so the upper bound is pushed a day out —
   * otherwise a closure falling on the last day of the range would be missed,
   * and that day would be charged as leave.
   */
  async scheduleBetween(from: Date, to: Date): Promise<WorkingSchedule> {
    const [policy, closedDates] = await Promise.all([
      attendancePolicyRepository.get(),
      holidayRepository.closedDatesBetween(from, addUtcDays(to, 1)),
    ]);

    return makeSchedule(policy.workingDays, closedDates);
  },

  /** Whether one date is a working day, weekly schedule and closures together. */
  async isWorkingDay(date: Date): Promise<boolean> {
    return isWorkingDay(date, await this.scheduleFor([date]));
  },

  /**
   * How many working days an inclusive range holds — the cost of a leave request.
   *
   * The server's own answer, computed from the database rather than from
   * anything the browser sent. The form may show a figure of its own; this is
   * the one that decides.
   */
  async countWorkingDays(from: Date, to: Date): Promise<number> {
    return countWorkingDays(from, to, await this.scheduleBetween(from, to));
  },

  /** The working days in an inclusive range, in order. */
  async workingDaysBetween(from: Date, to: Date): Promise<Date[]> {
    return workingDaysBetween(from, to, await this.scheduleBetween(from, to));
  },

  /** Sorts a set of dates into working, weekly off and closed. */
  async split(dates: readonly Date[]): Promise<DaySplit> {
    return splitByDayKind(dates, await this.scheduleFor(dates));
  },

  /** The weekly configuration on its own, for the settings screen. */
  async weeklySchedule(): Promise<WorkingWeek> {
    return toWorkingWeek(await attendancePolicyRepository.get());
  },

  /**
   * Rewrites the working week.
   *
   * A week with no working days is refused rather than stored. It would not
   * merely be odd: nobody could ever book leave again, since every request would
   * contain zero working days, and the warning sweep would quietly stop running
   * while still appearing configured. Belt and braces over the schema, which
   * checks the same thing — this is the value two separate features depend on.
   *
   * Sorted and de-duplicated so the stored set reads the way a week does,
   * whatever order the toggles came back in.
   */
  async setWeeklySchedule(actorId: string, input: UpdateWorkingWeekInput): Promise<WorkingWeek> {
    if (input.workingDays.length === 0) {
      throw new ValidationError("Choose at least one working day.", {
        workingDays: "A week with no working days would leave nobody able to book leave.",
      });
    }

    const workingDays = [...new Set(input.workingDays)].sort((a, b) => a - b);

    return toWorkingWeek(await attendancePolicyRepository.update({ workingDays }, actorId));
  },
};
