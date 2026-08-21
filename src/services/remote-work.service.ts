import { EmployeeStatus, RemoteWorkAction, Role, type RemoteWorkType } from "@prisma/client";

import { addUtcDays, todayUtc } from "@/lib/date";
import { isSuperAdminRole, rolesInPopulation } from "@/lib/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  coversDate,
  describeRemotePeriod,
  remoteDayCount,
  remoteWorkState,
  resolveRemotePeriod,
  revocationEndDate,
  REMOTE_WORK_TYPE,
  type RemotePeriod,
  type RemoteWorkState,
  type RemoteWorkTypeValue,
} from "@/lib/remote-work";
import { employeeRepository } from "@/repositories/employee.repository";
import { leaveRepository } from "@/repositories/leave.repository";
import {
  remoteWorkRepository,
  type RemoteCoverage,
  type RemoteWorkDto,
  type RemoteWorkEventDto,
} from "@/repositories/remote-work.repository";
import { emailService } from "@/services/email/email.service";
import { populationService, type PopulationActor } from "@/services/population.service";
import type {
  CreateRemoteWorkInput,
  RemoteWorkQuery,
  RevokeRemoteWorkInput,
  UpdateRemoteWorkInput,
} from "@/validations/remote-work.schema";

/**
 * Remote work: a stretch of days one person is **exempt from attendance** for.
 *
 * The rule this service exists to protect is one sentence long — *remote is not
 * attendance* — and almost none of it is enforced here. A remote date is neither
 * present, nor absent, nor leave because `describeDay` in
 * `attendance.service.ts` says so, in the one place every other day status is
 * decided; the roster, the warning sweep, the assistant, the report and the
 * three exports inherit it for free. Nothing is written to `attendance` or
 * `leaves` when a period is assigned, and nothing is deleted when one is
 * revoked, so shortening a period puts its days straight back on the register
 * with nothing to migrate — the same reversibility the holiday rules have.
 *
 * What this service actually decides is narrower: **who** may put somebody on
 * remote work, **which** dates a chosen duration comes to, and **whether** the
 * result clashes with something already there.
 */

/** An assignment with its derived state, which is the only way it is ever read. */
export type RemoteWorkAssignmentView = RemoteWorkDto & {
  state: RemoteWorkState;
  /** Calendar days covered, or null for an open-ended arrangement. */
  dayCount: number | null;
  periodLabel: string;
};

export type RemoteWorkSummary = {
  /** People remote today. The dashboard tile, and never a count of rows. */
  activeToday: number;
  scheduled: number;
  untilRevoked: number;
};

export type AssignRemoteWorkResult = {
  assignment: RemoteWorkAssignmentView;
  /**
   * Whether the letter left. Reported rather than thrown, as everywhere here —
   * an assignment nobody was told about is still an assignment, and the
   * administrator is the only person able to notice the message never arrived.
   */
  emailSent: boolean;
  /**
   * Approved leave already booked inside the new period.
   *
   * **Reported, never overridden.** Leave outranks remote in `describeDay`, so
   * these days stay on leave and stay charged — which is right: somebody who
   * booked a day off is not working from home that day, they are not working.
   * Refusing the assignment instead would force an administrator to cancel
   * somebody's leave in order to arrange their remote month, and silently
   * absorbing it would hand back allowance nobody asked to have back.
   */
  leaveDatesInPeriod: Date[];
};

/**
 * Whether this account may manage remote work.
 *
 * The super admin always; an administrator once granted `canManageRemoteWork`,
 * read from the row on every call rather than from the session — the same
 * discipline the other seven delegable rights follow, so withdrawing it bites on
 * the next request instead of when a week-old token expires.
 */
async function mayManage(actor: PopulationActor): Promise<boolean> {
  if (isSuperAdminRole(actor.role)) return true;
  if (actor.role !== Role.ADMIN) return false;

  const employee = await employeeRepository.findById(actor.id);
  return Boolean(employee?.canManageRemoteWork);
}

async function assertMayManage(actor: PopulationActor): Promise<void> {
  if (await mayManage(actor)) return;

  throw new ForbiddenError(
    actor.role === Role.ADMIN
      ? "You do not have permission to manage remote work. Ask your super administrator to enable it."
      : "Only administrators can manage remote work.",
  );
}

/**
 * Whose remote work this account may arrange.
 *
 * Deliberately **`assertMayCorrect`'s shape and not `assertMayManage`'s**, and
 * for the same reason attendance corrections take that shape: this writes an
 * arrangement about somebody's working days and touches nothing about their
 * account, so an administrator who works from home has exactly the problem an
 * employee does. A granted administrator therefore reaches `EMPLOYEE` and
 * `ADMIN` alike.
 *
 * Two refusals, both load-bearing:
 *
 * - **Nobody arranges their own remote work.** The whole effect of a period is
 *   to take somebody off the attendance register; aimed at yourself it is a way
 *   to mark yourself permanently exempt without ever going in — the geofence
 *   defeated rather than excepted, which is the argument `assertMayCorrect`
 *   makes about marking yourself present. Somebody else with the grant does it
 *   for you.
 * - **Nobody arranges the super admin's**, itself included, mirroring
 *   `assertMayCorrect` exactly. An administrator able to exempt the account that
 *   granted them the right would be the boundary running backwards.
 */
function assertMayArrangeFor(actor: PopulationActor, target: { id: string; role: Role }): void {
  if (target.id === actor.id) {
    throw new ForbiddenError(
      "You cannot arrange your own remote work. Exempting yourself from attendance is not something to decide alone — ask another administrator.",
    );
  }

  if (target.role === Role.SUPER_ADMIN) {
    throw new ForbiddenError("The super administrator's remote work cannot be arranged from here.");
  }
}

/** The stored row, plus everything derivable from it. Read nowhere else. */
function decorate(assignment: RemoteWorkDto, today: Date): RemoteWorkAssignmentView {
  const period: RemotePeriod = { startDate: assignment.startDate, endDate: assignment.endDate };

  return {
    ...assignment,
    state: remoteWorkState(assignment, today),
    dayCount: remoteDayCount(period),
    periodLabel: describeRemotePeriod(period),
  };
}

/**
 * Who a period is for, once it is known they exist and may be arranged for.
 *
 * `requireActive` is the whole of the difference between the two callers, and it
 * is deliberate. **Assigning** demands an active account, matching
 * `listAttendanceRoster` and the report's bulk selections: a suspended account
 * is not on the register this week, so an exemption from it would mean nothing.
 * **Editing and revoking** do not, because otherwise suspending somebody would
 * strand their live arrangement — unable to be ended by anybody, and still
 * counted among the people working remotely. Naming an existing period is an
 * explicit instruction about it, the same argument the reset makes for leaving a
 * single named date alone.
 *
 * The refusal is phrased as *not found* so the endpoint cannot be used to
 * discover which ids belong to administrators — the wording the account
 * endpoints use.
 */
async function resolveTarget(actor: PopulationActor, employeeId: string, requireActive: boolean) {
  const employee = await employeeRepository.findById(employeeId);

  if (!employee || (requireActive && employee.status !== EmployeeStatus.ACTIVE)) {
    throw new NotFoundError("That person is not on the staff list.");
  }

  assertMayArrangeFor(actor, employee);

  return employee;
}

/**
 * Refuses a period that would sit on top of one already running.
 *
 * §11's requirement, answered by prevention rather than by merging: two live
 * periods covering one day would make "is this person remote" a question with
 * two answers, and the coverage predicate would happily satisfy it from either.
 * Merging them silently would be worse — an administrator who meant to move a
 * period would find they had extended it.
 *
 * The message names the period in the way and points at the two things that
 * actually resolve it, because "already remote" on its own leaves somebody
 * hunting for a row they cannot see from the dialog.
 */
async function assertNoOverlap(
  employeeId: string,
  name: string,
  period: RemotePeriod,
  excludeId?: string,
): Promise<void> {
  const clash = await remoteWorkRepository.findOverlapping(employeeId, period, excludeId);
  if (!clash) return;

  throw new ConflictError(
    `${name} already has remote work covering ${describeRemotePeriod(clash)}, which overlaps the dates you chose. Edit that period or revoke it first.`,
  );
}

/** Approved leave already booked inside a period — reported, never overridden. */
async function leaveInsidePeriod(employeeId: string, period: RemotePeriod): Promise<Date[]> {
  // An open-ended period is bounded at a year for this question alone. It is a
  // courtesy notice about clashes an administrator can act on, and leave booked
  // three years out is neither.
  const to = period.endDate ?? addUtcDays(period.startDate, 365);
  const leaves = await leaveRepository.approvedForEmployeesBetween([employeeId], period.startDate, to);

  return leaves.map((leave) => leave.leaveDate);
}

export const remoteWorkService = {
  mayManage,

  /**
   * Assignments matching the filters, with their state, newest period first.
   *
   * **Fetched whole and paged in memory**, the same trade `attendanceService.roster`
   * and `reportService.generate` make and for the identical reason: the thing a
   * row is filtered on — whether the period is active, scheduled, ended or
   * revoked — **does not exist in the database to filter by**. It is derived from
   * three dates against today. Paging in SQL first would make "who is remote
   * right now" return a page of whoever sorted first, most of whom are not.
   *
   * The bound is headcount rather than time: an organisation holds as many of
   * these as it has remote arrangements.
   */
  async list(
    actor: PopulationActor,
    query: RemoteWorkQuery,
  ): Promise<{
    items: RemoteWorkAssignmentView[];
    total: number;
    summary: RemoteWorkSummary;
    canManage: boolean;
  }> {
    // Reading the roster is the administrator's job; separating the
    // administrators out from it is the delegable disclosure, so the population
    // filter answers to `canViewAdminRecords` here exactly as it does on the
    // attendance screen. Both are asked, because they are different questions:
    // an administrator may be allowed to see who is remote without being allowed
    // to arrange it, and the screen renders read-only in that case.
    await populationService.assertMayFilter(actor, query.population);

    const today = todayUtc();

    const rows = await remoteWorkRepository.list({
      search: query.search,
      department: query.department,
      employeeId: query.employeeId,
      roles: query.population === "ALL" ? undefined : rolesInPopulation(query.population),
    });

    const decorated = rows.map((row) => decorate(row, today));
    const filtered = query.state === "ALL" ? decorated : decorated.filter((row) => row.state === query.state);
    const start = (query.page - 1) * query.pageSize;

    return {
      items: filtered.slice(start, start + query.pageSize),
      total: filtered.length,
      // Counted over everything the filters matched rather than over the page,
      // so the tiles keep meaning the same thing on page two. `activeToday`
      // counts **people**, not rows, because the overlap rule means one person
      // can hold at most one live period on any day but may hold a revoked one
      // beside it.
      summary: {
        activeToday: new Set(
          decorated.filter((row) => row.state === "ACTIVE").map((row) => row.employeeId),
        ).size,
        scheduled: decorated.filter((row) => row.state === "SCHEDULED").length,
        untilRevoked: decorated.filter(
          (row) => row.state === "ACTIVE" && row.endDate === null,
        ).length,
      },
      // Mirrors the real check so the screen can hide a form it may not submit —
      // exactly as `canIssue` and `canManage` do on the invitation and holiday
      // routes. It never replaces it.
      canManage: await mayManage(actor),
    };
  },

  /**
   * Puts somebody on remote work.
   *
   * The chosen duration becomes two dates **here and once**, through
   * `resolveRemotePeriod` against the company's calendar day — never from a date
   * the browser worked out, whose clock may be a day off, and never re-derived
   * on read, which would quietly walk a week-long period forward every time
   * somebody looked at it.
   */
  async assign(actor: PopulationActor, input: CreateRemoteWorkInput): Promise<AssignRemoteWorkResult> {
    await assertMayManage(actor);

    const target = await resolveTarget(actor, input.employeeId, true);
    const today = todayUtc();

    const period = resolveRemotePeriod(
      input.type as RemoteWorkTypeValue,
      today,
      input.type === REMOTE_WORK_TYPE.CUSTOM
        ? { startDate: input.startDate, endDate: input.endDate }
        : undefined,
    );

    await assertNoOverlap(target.id, target.name, period);

    const [assignment, leaveDatesInPeriod] = await Promise.all([
      remoteWorkRepository.create({
        employeeId: target.id,
        startDate: period.startDate,
        endDate: period.endDate,
        type: input.type as RemoteWorkType,
        reason: input.reason,
        assignedById: actor.id,
      }),
      leaveInsidePeriod(target.id, period),
    ]);

    await remoteWorkRepository.recordEvent({
      assignmentId: assignment.id,
      employeeId: target.id,
      action: RemoteWorkAction.ASSIGNED,
      newStart: period.startDate,
      newEnd: period.endDate,
      reason: input.reason,
      actorId: actor.id,
    });

    const emailSent = await emailService.sendRemoteWorkAssigned(target.email, {
      name: target.name,
      period: describeRemotePeriod(period),
      dayCount: remoteDayCount(period),
      reason: input.reason,
      assignedByName: actor.id === target.id ? "you" : await actorName(actor.id),
      permanent: period.endDate === null,
    });

    return { assignment: decorate(assignment, today), emailSent, leaveDatesInPeriod };
  },

  /**
   * Moves a period's dates, or rewrites what was said about it.
   *
   * A **revoked** period is refused: it is the record of an arrangement that was
   * called off, and editing it would make the audit trail describe something
   * that never ran. Revoke and assign afresh instead — two rows say what
   * happened, one edited row does not.
   *
   * An **ended** period is editable, deliberately, and that is the interesting
   * case. "She was actually working from home all last week" is a correction
   * somebody genuinely needs to make, and it is the exact counterpart of
   * `markPresentFor` correcting a day the geofence missed — it turns days that
   * read `ABSENT` into days that read `REMOTE`. It cannot overwrite anything
   * proved: a check-in outranks remote in `describeDay`, so a day somebody
   * actually came in still reads `PRESENT`. Every such edit is on the audit
   * trail with both periods on it.
   *
   * The type becomes `CUSTOM`, because that is what a hand-picked pair of dates
   * is. Keeping "One week" on a period whose end has been dragged three days out
   * would leave the label contradicting the dates beside it.
   */
  async update(
    actor: PopulationActor,
    id: string,
    input: UpdateRemoteWorkInput,
  ): Promise<{ assignment: RemoteWorkAssignmentView; emailSent: boolean }> {
    await assertMayManage(actor);

    const existing = await remoteWorkRepository.findById(id);
    if (!existing) throw new NotFoundError("That remote work arrangement no longer exists.");

    await resolveTarget(actor, existing.employeeId, false);

    if (existing.revokedAt) {
      throw new ConflictError(
        "That arrangement has been revoked, so it can no longer be edited. It stays on the record; assign a new period instead.",
      );
    }

    const today = todayUtc();
    const previous: RemotePeriod = { startDate: existing.startDate, endDate: existing.endDate };

    const startDate = input.startDate ?? existing.startDate;
    // `undefined` means leave it alone; an explicit `null` means make it
    // open-ended. The schema keeps those two apart precisely so this line can.
    const endDate = input.endDate === undefined ? existing.endDate : input.endDate;

    if (endDate && endDate.getTime() < startDate.getTime()) {
      throw new ValidationError("The end date cannot be before the start date.", {
        endDate: "Choose a date on or after the start date.",
      });
    }

    const period: RemotePeriod = { startDate, endDate };
    const movingDates =
      startDate.getTime() !== existing.startDate.getTime() ||
      (endDate?.getTime() ?? null) !== (existing.endDate?.getTime() ?? null);

    if (movingDates) await assertNoOverlap(existing.employeeId, existing.employee.name, period, id);

    const updated = await remoteWorkRepository.update(id, {
      startDate,
      endDate,
      reason: input.reason ?? existing.reason,
      ...(movingDates ? { type: REMOTE_WORK_TYPE.CUSTOM as RemoteWorkType } : {}),
    });

    await remoteWorkRepository.recordEvent({
      assignmentId: id,
      employeeId: existing.employeeId,
      action: RemoteWorkAction.MODIFIED,
      previousStart: previous.startDate,
      previousEnd: previous.endDate,
      newStart: period.startDate,
      newEnd: period.endDate,
      reason: input.reason ?? existing.reason,
      actorId: actor.id,
    });

    // Only when the dates actually moved. A corrected typo in the reason is not
    // something to email somebody about, and a letter saying "your remote work
    // has changed" that names the same two dates twice reads as a mistake.
    const emailSent = movingDates
      ? await emailService.sendRemoteWorkUpdated(existing.employee.email, {
          name: existing.employee.name,
          previousPeriod: describeRemotePeriod(previous),
          period: describeRemotePeriod(period),
          reason: input.reason ?? existing.reason,
          changedByName: await actorName(actor.id),
          permanent: period.endDate === null,
        })
      : false;

    return { assignment: decorate(updated, today), emailSent };
  },

  /**
   * Calls a period off, and puts the person back on the register from tomorrow.
   *
   * **It does not delete coverage already served**, and that is the whole design.
   * `revocationEndDate` truncates `endDate` to today rather than erasing the row,
   * so the fortnight somebody has genuinely worked from home stays exempt and
   * only the future comes back — deleting instead would retroactively mark every
   * one of those days absent, which is precisely the false record this feature
   * exists to prevent. §4's "do not retroactively generate false attendance
   * records for the remote period", enforced by arithmetic rather than by
   * remembering.
   *
   * A period that has not started yet is closed to an empty range, so an
   * instruction that never took effect covers nothing at all.
   *
   * The revocation is **claimed** with a conditional update, so of two
   * administrators pressing the button at once exactly one writes the audit
   * event and exactly one letter goes out.
   */
  async revoke(
    actor: PopulationActor,
    id: string,
    input: RevokeRemoteWorkInput,
  ): Promise<{ assignment: RemoteWorkAssignmentView; emailSent: boolean; resumesOn: Date }> {
    await assertMayManage(actor);

    const existing = await remoteWorkRepository.findById(id);
    if (!existing) throw new NotFoundError("That remote work arrangement no longer exists.");

    await resolveTarget(actor, existing.employeeId, false);

    if (existing.revokedAt) {
      throw new ConflictError("That arrangement has already been revoked.");
    }

    const today = todayUtc();
    const previous: RemotePeriod = { startDate: existing.startDate, endDate: existing.endDate };
    const endDate = revocationEndDate(previous, today);

    const claimed = await remoteWorkRepository.revoke(id, {
      endDate,
      revokedById: actor.id,
      revokeReason: input.reason ?? null,
    });

    if (!claimed) {
      throw new ConflictError("Someone has just revoked that arrangement.");
    }

    await remoteWorkRepository.recordEvent({
      assignmentId: id,
      employeeId: existing.employeeId,
      action: RemoteWorkAction.REVOKED,
      previousStart: previous.startDate,
      previousEnd: previous.endDate,
      newStart: existing.startDate,
      newEnd: endDate,
      reason: input.reason ?? null,
      actorId: actor.id,
    });

    // The day after the coverage now ends, which is the day the person is next
    // expected in — not the day of the revocation, and the two differ whenever a
    // period is called off before it started.
    const resumesOn = addUtcDays(endDate, 1);

    const emailSent = await emailService.sendRemoteWorkRevoked(existing.employee.email, {
      name: existing.employee.name,
      period: describeRemotePeriod({ startDate: existing.startDate, endDate }),
      resumesOn,
      reason: input.reason ?? null,
      revokedByName: await actorName(actor.id),
    });

    const refreshed = await remoteWorkRepository.findById(id);

    return {
      assignment: decorate(refreshed ?? existing, today),
      emailSent,
      resumesOn,
    };
  },

  /** One arrangement's audit trail, oldest first. */
  async history(actor: PopulationActor, id: string): Promise<RemoteWorkEventDto[]> {
    // Reading the history is reading who was exempted from attendance and when,
    // so it sits behind the same grant the rest of the screen does rather than
    // behind bare `requireAdmin`.
    await assertMayManage(actor);

    const existing = await remoteWorkRepository.findById(id);
    if (!existing) throw new NotFoundError("That remote work arrangement no longer exists.");

    return remoteWorkRepository.listEvents(id);
  },

  /**
   * Every arrangement one person has held, for their profile section.
   *
   * Behind `assertMayManage` because it is the management view of somebody
   * else's record. An employee reads their own through `currentFor` below, which
   * takes no actor at all — the id comes off the session and there is no way to
   * widen it, the same shape `/api/attendance` and `/api/complaints` take.
   */
  async forEmployee(actor: PopulationActor, employeeId: string): Promise<RemoteWorkAssignmentView[]> {
    await assertMayManage(actor);

    const today = todayUtc();
    const rows = await remoteWorkRepository.list({ employeeId });

    return rows.map((row) => decorate(row, today));
  },

  /**
   * Where one person stands today — what their own screens read.
   *
   * Deliberately **ungated**: it answers only about the session's own id, which
   * the route supplies, so there is nothing here to widen. Somebody is entitled
   * to know whether they are expected in the office.
   */
  async currentFor(employeeId: string, day: Date = todayUtc()): Promise<RemoteWorkAssignmentView | null> {
    const assignment = await remoteWorkRepository.findCoveringDay(employeeId, day);
    return assignment ? decorate(assignment, day) : null;
  },

  /**
   * Whether somebody is remote on a date, as the one question the rest of the
   * system asks.
   *
   * `coversDate` is applied over the fetched row rather than trusted from the
   * query, so the SQL predicate and the pure rule are checked against each other
   * on every call — they are written to match, and this is what would surface it
   * if they ever stopped.
   */
  async isRemoteOn(employeeId: string, day: Date): Promise<boolean> {
    const assignment = await remoteWorkRepository.findCoveringDay(employeeId, day);
    return assignment !== null && coversDate(assignment, day);
  },

  /** Everyone remote on one date. What `buildRoster` reads. */
  employeeIdsRemoteOn(day: Date): Promise<string[]> {
    return remoteWorkRepository.employeeIdsRemoteOn(day);
  },

  /** Remote coverage for a set of people across a span. What `buildHistories` reads. */
  coverageFor(employeeIds: string[], from: Date, to: Date): Promise<RemoteCoverage[]> {
    return remoteWorkRepository.coveringBetween(employeeIds, from, to);
  },

  /** How many people are remote today, for the admin overview tile. */
  countRemoteOn(day: Date, roles?: Role[]): Promise<number> {
    return remoteWorkRepository.countRemoteOn(day, roles);
  },

  /**
   * Which of these dates a remote period already covers.
   *
   * `planLeave`'s one question, asked over a whole requested range in a single
   * query rather than a day at a time — the same shape as
   * `holidayRepository.closedDatesAmong`, which sits beside it in that function.
   * The dates come back in the order they were asked about, so the refusal reads
   * as a range rather than as a shuffled list.
   */
  async remoteDatesAmong(employeeId: string, dates: Date[]): Promise<Date[]> {
    if (dates.length === 0) return [];

    const from = dates.reduce((earliest, date) => (date < earliest ? date : earliest), dates[0]);
    const to = dates.reduce((latest, date) => (date > latest ? date : latest), dates[0]);

    const spans = await remoteWorkRepository.coveringBetweenFor(employeeId, from, to);
    if (spans.length === 0) return [];

    return dates.filter((date) => spans.some((span) => coversDate(span, date)));
  },

  /** Administrators the super admin can grant or withdraw the right for. */
  listAdmins() {
    return employeeRepository.listAdmins();
  },

  /**
   * Grants or withdraws the right. The super admin's alone, gated in the route
   * that calls this — delegating the delegation would defeat the point.
   */
  async setPermission(adminId: string, allowed: boolean) {
    const employee = await employeeRepository.findById(adminId);
    if (!employee) throw new NotFoundError("That account no longer exists.");

    // Guards against handing the flag to an employee, where it would mean
    // nothing, or to the super admin, whose right is not stored here at all.
    if (employee.role !== Role.ADMIN) {
      throw new ConflictError("Remote work permissions apply to administrators only.");
    }

    return employeeRepository.setRemoteWorkPermission(adminId, allowed);
  },
};

/** Who did it, for a letter that would otherwise say "an administrator". */
async function actorName(actorId: string): Promise<string> {
  const actor = await employeeRepository.findById(actorId);
  return actor?.name ?? "an administrator";
}
