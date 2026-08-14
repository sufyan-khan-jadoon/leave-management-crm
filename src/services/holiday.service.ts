import { HolidayNotice, Role } from "@prisma/client";

import { todayUtc, utcWeekday } from "@/lib/date";
import { isSuperAdminRole } from "@/lib/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { planHolidayNotice } from "@/lib/holiday-notice";
import { employeeRepository } from "@/repositories/employee.repository";
import { holidayRepository, type HolidayDto } from "@/repositories/holiday.repository";
import { emailService } from "@/services/email/email.service";
import type { CreateHolidayInput, UpdateHolidayInput } from "@/validations/holiday.schema";

/** Who is asking. The same shape the invitation rules take. */
export type HolidayActor = { id: string; role: Role };

/** What one sweep of the announcements did, for the cron response and the log. */
export type NoticeSweep = {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  /** Rows another worker had already claimed by the time we reached them. */
  claimedElsewhere: number;
};

/**
 * Whether this account may close the office.
 *
 * The super admin always may. An administrator may only once granted it, and the
 * grant is read from the database on every call rather than from the session —
 * the same rule `canInviteEmployees` follows, and for the same reason: taking
 * the right away has to bite on the next request, not whenever a week-old token
 * happens to expire. Employees never may.
 */
async function mayManage(actor: HolidayActor): Promise<boolean> {
  if (isSuperAdminRole(actor.role)) return true;
  if (actor.role !== Role.ADMIN) return false;

  const employee = await employeeRepository.findById(actor.id);
  return Boolean(employee?.canManageHolidays);
}

async function assertMayManage(actor: HolidayActor): Promise<void> {
  if (await mayManage(actor)) return;

  throw new ForbiddenError(
    actor.role === Role.ADMIN
      ? "You do not have permission to manage office days off. Ask your super administrator to enable it."
      : "Only administrators can manage office days off.",
  );
}

/** A closure that has already arrived is history, and history is not editable. */
function assertStillAhead(holiday: HolidayDto, verb: string): void {
  if (holiday.date.getTime() <= todayUtc().getTime()) {
    throw new ConflictError(
      `That day off has already started, so it can no longer be ${verb}. It stays on the record for reporting.`,
    );
  }
}

function assertNotPast(date: Date): void {
  if (date.getTime() < todayUtc().getTime()) {
    throw new ValidationError("That date has already passed.", { date: "Choose today or a later date." });
  }
}

/**
 * Sends one announcement to everyone, once.
 *
 * The row is *claimed* before a single email goes out: `claimNotice` moves it
 * out of SCHEDULED with a conditional update, so of two workers racing on the
 * same closure exactly one proceeds and the other is told to leave it alone.
 * That ordering is deliberate — claiming after sending would leave a crash
 * between the two looking exactly like a row nobody had touched, and the whole
 * company would hear about the holiday twice.
 *
 * Delivery failures are recorded rather than thrown, as everywhere else here.
 * A closure that could not be announced is still a closure.
 */
async function announce(holiday: HolidayDto): Promise<"sent" | "skipped" | "failed" | "claimed-elsewhere"> {
  const today = todayUtc().getTime();

  // Re-checked at the moment of sending, not only when it was scheduled: a
  // sweep that has been down for a day would otherwise mail about a closure
  // that is already over. A closure that is *today* is still worth announcing,
  // and says so in its own words — see `planHolidayNotice`.
  if (holiday.date.getTime() < today) {
    if (!(await holidayRepository.claimNotice(holiday.id, HolidayNotice.SKIPPED))) return "claimed-elsewhere";
    return "skipped";
  }

  if (!(await holidayRepository.claimNotice(holiday.id, HolidayNotice.SENT))) return "claimed-elsewhere";

  const recipients = await employeeRepository.listNotifiable();
  const weekday = utcWeekday(holiday.date);
  // Decided here, from the row, rather than passed down from whoever called:
  // the same closure is announced by a creation and by the sweep, and the two
  // must not be able to word it differently.
  const closesToday = holiday.date.getTime() === today;

  const results = await Promise.all(
    recipients.map((person) =>
      emailService.sendOfficeClosed(person.email, {
        name: person.name,
        weekday,
        date: holiday.date,
        reason: holiday.reason,
        closesToday,
      }),
    ),
  );

  // Reaching nobody at all reads as a broken mailer rather than a delivered
  // announcement; reaching most of the office is a success with some bounces,
  // which the mail log already records per address.
  const delivered = results.filter(Boolean).length;

  if (recipients.length > 0 && delivered === 0) {
    await holidayRepository.settleNotice(holiday.id, HolidayNotice.FAILED, null);
    return "failed";
  }

  await holidayRepository.settleNotice(holiday.id, HolidayNotice.SENT, new Date());
  return "sent";
}

export const holidayService = {
  mayManage,

  list(): Promise<HolidayDto[]> {
    return holidayRepository.list();
  },

  upcoming(take = 5): Promise<HolidayDto[]> {
    return holidayRepository.upcoming(todayUtc(), take);
  },

  /**
   * Closes the office on one date, and settles there and then what happens
   * about telling people.
   *
   * The announcement is decided at creation rather than left for the sweep to
   * work out, because the interesting cases are the ones where it is already too
   * late to schedule anything: a closure declared at 3pm for tomorrow has missed
   * its noon slot, and one declared for today never had a slot at all. Waiting
   * for the next sweep would mean announcing either of them after the office had
   * already closed. Both send immediately, in the same request.
   *
   * `assertNotPast` runs first, so `plan` can only ever be `send` or `schedule`
   * here — the `skip` arms below are the type's, not a case this can reach.
   */
  async create(actor: HolidayActor, input: CreateHolidayInput): Promise<HolidayDto> {
    await assertMayManage(actor);
    assertNotPast(input.date);

    const clash = await holidayRepository.findByDate(input.date);
    if (clash) {
      throw new ConflictError(`The office is already closed that day, for ${clash.reason}.`);
    }

    const plan = planHolidayNotice(input.date);

    const holiday = await holidayRepository.create({
      date: input.date,
      reason: input.reason,
      declaredById: actor.id,
      // Written as SCHEDULED even when it is about to be sent in this very
      // request: `announce` claims the row out of SCHEDULED, so this is what
      // makes the immediate send take the same one-winner path as the sweep.
      notice: plan.action === "skip" ? HolidayNotice.SKIPPED : HolidayNotice.SCHEDULED,
      noticeDueAt: plan.action === "skip" ? null : plan.dueAt,
    });

    // Null means the unique index refused it — somebody closed the same day
    // between the check above and this insert.
    if (!holiday) {
      throw new ConflictError("Someone has just closed the office on that date.");
    }

    if (plan.action === "send") await announce(holiday);

    return (await holidayRepository.findById(holiday.id)) ?? holiday;
  },

  /**
   * Moves a closure or renames its reason, and rebuilds the announcement around
   * the result.
   *
   * Moving the date re-plans from scratch, so a closure pushed further out gets
   * its announcement pushed with it. One that has already been announced is left
   * announced: people have been told, and a second email saying something
   * different is a decision for a human to make rather than a side effect of
   * correcting a typo.
   */
  async update(actor: HolidayActor, id: string, input: UpdateHolidayInput): Promise<HolidayDto> {
    await assertMayManage(actor);

    const existing = await holidayRepository.findById(id);
    if (!existing) throw new NotFoundError("That day off no longer exists.");

    assertStillAhead(existing, "edited");

    const date = input.date ?? existing.date;
    const movingDate = date.getTime() !== existing.date.getTime();

    if (movingDate) {
      assertNotPast(date);

      const clash = await holidayRepository.findByDate(date);
      if (clash && clash.id !== id) {
        throw new ConflictError(`The office is already closed that day, for ${clash.reason}.`);
      }
    }

    const alreadyAnnounced = existing.notice === HolidayNotice.SENT;
    const plan = planHolidayNotice(date);

    const rescheduled =
      movingDate && !alreadyAnnounced
        ? {
            notice: plan.action === "skip" ? HolidayNotice.SKIPPED : HolidayNotice.SCHEDULED,
            noticeDueAt: plan.action === "skip" ? null : plan.dueAt,
          }
        : {};

    const updated = await holidayRepository.update(id, {
      ...(input.date ? { date } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...rescheduled,
    });

    if (!updated) throw new ConflictError("Someone has just closed the office on that date.");

    // A date dragged past its own noon slot has to go out now, for the same
    // reason a late creation does.
    if (movingDate && !alreadyAnnounced && plan.action === "send") await announce(updated);

    return (await holidayRepository.findById(id)) ?? updated;
  },

  /**
   * Reopens the office on a date nobody has reached yet.
   *
   * Deleting the row is what cancels the announcement: the sweep only ever reads
   * rows that exist, so there is no separate schedule to tear down and no way for
   * a withdrawn closure to be announced afterwards. Leave and allowances go back
   * to normal for that date by the same stroke, because every rule reads the
   * table rather than a copy of it.
   *
   * A closure that has already happened is refused — deleting it would quietly
   * bill people a day of leave for a day the office was shut.
   */
  async remove(actor: HolidayActor, id: string): Promise<HolidayDto> {
    await assertMayManage(actor);

    const existing = await holidayRepository.findById(id);
    if (!existing) throw new NotFoundError("That day off no longer exists.");

    assertStillAhead(existing, "deleted");

    return holidayRepository.delete(id);
  },

  /**
   * Makes every announcement that has come due.
   *
   * Safe to run as often as you like and safe to run twice at once: each row is
   * claimed before anything is sent, so repeats find nothing left to claim.
   */
  async dispatchDueNotices(now: Date = new Date()): Promise<NoticeSweep> {
    const due = await holidayRepository.findDueNotices(now);
    const sweep: NoticeSweep = { considered: due.length, sent: 0, skipped: 0, failed: 0, claimedElsewhere: 0 };

    for (const holiday of due) {
      const outcome = await announce(holiday);

      if (outcome === "sent") sweep.sent += 1;
      else if (outcome === "skipped") sweep.skipped += 1;
      else if (outcome === "failed") sweep.failed += 1;
      else sweep.claimedElsewhere += 1;
    }

    return sweep;
  },

  /** Which of these dates the office is closed on — the leave rules' one question. */
  closedDatesAmong(dates: Date[]): Promise<Date[]> {
    return holidayRepository.closedDatesAmong(dates);
  },

  closedDatesBetween(from: Date, to: Date): Promise<Date[]> {
    return holidayRepository.closedDatesBetween(from, to);
  },

  /** Administrators the super admin can grant or withdraw the right for. */
  listAdmins() {
    return employeeRepository.listAdmins();
  },

  async setPermission(adminId: string, allowed: boolean) {
    const employee = await employeeRepository.findById(adminId);
    if (!employee) throw new NotFoundError("That account no longer exists.");

    // Guards against handing the flag to an employee, where it would mean
    // nothing, or to the super admin, whose right is not stored here at all.
    if (employee.role !== Role.ADMIN) {
      throw new ConflictError("Day-off permissions apply to administrators only.");
    }

    return employeeRepository.setHolidayPermission(adminId, allowed);
  },
};
