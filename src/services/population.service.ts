import { Role } from "@prisma/client";

import { isSuperAdminRole, type Population } from "@/lib/enums";
import { ForbiddenError } from "@/lib/errors";
import { employeeRepository } from "@/repositories/employee.repository";

/** Whoever is asking. The id is needed because the grant is read from the row. */
export type PopulationActor = { id: string; role: Role };

/** What the attendance roster accepts: everybody, or one of the two populations. */
export type PopulationFilter = "ALL" | Population;

/**
 * Whether this account may report on the administrators as a population.
 *
 * The super admin always may. An administrator may only once granted it, and the
 * grant is read from the database on every call rather than from the session —
 * the same rule `canInviteEmployees`, `canManageHolidays` and `canSendEmails`
 * follow, and for the same reason: taking the right away has to bite on the next
 * request, not whenever a week-old token happens to expire.
 *
 * This lives in its own service because it is the one delegable right that is
 * not owned by a feature. The other three each belong somewhere obvious — an
 * invitation, a closure, an email — while this one is asked by the attendance
 * roster, its CSV export and the admin overview alike. Written once so those
 * three cannot come to disagree about who may separate the administrators out.
 */
async function mayViewAdminRecords(actor: PopulationActor): Promise<boolean> {
  if (isSuperAdminRole(actor.role)) return true;
  if (actor.role !== Role.ADMIN) return false;

  const employee = await employeeRepository.findById(actor.id);
  return Boolean(employee?.canViewAdminRecords);
}

function refuse(actor: PopulationActor): never {
  throw new ForbiddenError(
    actor.role === Role.ADMIN
      ? "You do not have permission to view administrators as a separate group. Ask your super administrator to enable it."
      : "Only administrators can view attendance and leave by population.",
  );
}

export const populationService = {
  mayViewAdminRecords,

  /**
   * Guards a surface that also offers an **unfiltered** view.
   *
   * `ALL` is free — every administrator already sees administrators' attendance,
   * because the unfiltered roster lists every active account and
   * `attendanceRosterSelect` carries no `role` to give anybody away. What the
   * grant unlocks is separating them out, which is the same thing as being told
   * who they are.
   *
   * **`EMPLOYEE` is gated too, and that is not an oversight.** Filtering to the
   * employees looks harmless, but comparing that list against the unfiltered one
   * names the administrators just as precisely as asking for them. A filter that
   * leaks by subtraction is still a leak, so the whole control moves together
   * rather than half of it being open to everybody.
   *
   * Asserted in a service rather than in a route because there are two ways in —
   * the attendance screen and its CSV export — and a check written twice is a
   * check that will one day be written once. The routes still guard
   * `requireAdmin`; this decides the narrower question behind it, the way
   * `assertMayManage` does for accounts.
   */
  async assertMayFilter(actor: PopulationActor, population: PopulationFilter): Promise<void> {
    if (population === "ALL") return;
    if (await mayViewAdminRecords(actor)) return;

    refuse(actor);
  },

  /**
   * Guards a surface that always reports on **exactly one** population.
   *
   * The admin overview has no unfiltered figure to subtract from — it measures
   * the employees or the administrators and never both at once — so asking for
   * the employees gives nothing away, and every administrator keeps the
   * dashboard they have always opened on. Only `ADMIN` needs the grant here.
   *
   * That asymmetry with `assertMayFilter` is deliberate rather than an
   * inconsistency: the leak-by-subtraction argument is an argument about a
   * surface that offers both, and this one does not.
   */
  async assertMayReportOn(actor: PopulationActor, population: Population): Promise<void> {
    if (population !== Role.ADMIN) return;
    if (await mayViewAdminRecords(actor)) return;

    refuse(actor);
  },

  /**
   * Guards a surface that **names roles outright**: the reports screen.
   *
   * The strictest of the three, and the only one with no free case. Both other
   * asserts wave through a view that mentions nobody's role — `ALL` on the
   * roster, the employee half of the overview — because what the grant protects
   * is the ability to tell the two populations apart. A report cannot offer that
   * exemption: every row it prints carries a `Role` column, every person it can
   * be pointed at is offered by name in a picker that says what they are, and the
   * summaries are split by population. There is no version of this screen that
   * withholds the thing the grant exists to withhold, so the whole feature sits
   * behind it rather than half of it.
   *
   * The super admin always; an administrator once granted `canViewAdminRecords`,
   * read from the row on every request like the other four delegable rights, so
   * withdrawing it takes the reports away on the next request rather than when a
   * week-old token expires.
   *
   * It is deliberately **not** a sixth grant. Reporting on the workforce hands
   * over exactly the knowledge this one already hands over — who your colleagues
   * are and how the two groups compare — and a second column meaning the same
   * thing is two columns to keep in step. It confers no write of any kind:
   * `report.service.ts` reads, and every act on an account still answers to
   * `assertMayManage`, every correction to `assertMayCorrect`.
   */
  async assertMayReport(actor: PopulationActor): Promise<void> {
    if (await mayViewAdminRecords(actor)) return;

    // Worded for this screen rather than routed through `refuse`, which names
    // the population filter — somebody refused here was not filtering anything,
    // and being told about a control they never touched is how a refusal reads
    // as a bug.
    throw new ForbiddenError(
      actor.role === Role.ADMIN
        ? "You do not have permission to generate workforce reports. Ask your super administrator to enable it."
        : "Only administrators can generate workforce reports.",
    );
  },

  /**
   * Grants or withdraws the right. The super admin's alone, gated in the route
   * that calls this — delegating the delegation would defeat the point.
   */
  setPermission(adminId: string, allowed: boolean) {
    return employeeRepository.setAdminRecordsPermission(adminId, allowed);
  },
};
