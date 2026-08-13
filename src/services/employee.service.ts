import { EmployeeStatus, Role } from "@prisma/client";

import { toUtcDay } from "@/lib/date";
import { isSuperAdminRole } from "@/lib/enums";
import { ConflictError, ForbiddenError, NotFoundError } from "@/lib/errors";
import {
  employeeRepository,
  normalizeEmail,
  type EmployeeDto,
  type EmployeeListFilters,
} from "@/repositories/employee.repository";
import { isProfileComplete } from "@/services/auth.service";
import { emailService } from "@/services/email/email.service";
import { populationService } from "@/services/population.service";
import type { AdminEmployeeUpdateInput, ProfileSetupInput, ProfileUpdateInput } from "@/validations/employee.schema";

/** Whoever is performing the action — role decides what they may reach. */
export type Actor = { id: string; role: Role };

/**
 * Seniority rule for one account acting on another.
 *
 * An ordinary admin manages employees only. Administrator accounts answer to
 * the super admin alone, and the super admin's own account is not manageable
 * from the dashboard by anyone — including itself, since suspending or deleting
 * it would leave the organisation with nobody able to approve administrators.
 *
 * Applied to reads as well as writes: an admin who cannot manage an account
 * cannot fetch it either, and the refusal is phrased as "not found" so the
 * endpoint cannot be used to confirm that an id belongs to an administrator.
 */
function assertMayManage(actor: Actor, target: EmployeeDto): void {
  if (target.id === actor.id) {
    throw new ForbiddenError("You cannot change your own account here. Use your profile instead.");
  }

  if (target.role === Role.SUPER_ADMIN) {
    throw new ForbiddenError("The super administrator account cannot be managed from the dashboard.");
  }

  if (target.role === Role.ADMIN && !isSuperAdminRole(actor.role)) {
    throw new ForbiddenError("Only a super administrator can manage administrator accounts.");
  }
}

export const employeeService = {
  async byId(id: string): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw new NotFoundError("Employee not found.");
    return employee;
  },

  /**
   * `byId` for the admin dashboard, narrowed to what the viewer may see.
   *
   * Three ways through: the account is an employee, it is your own, or you hold
   * `canViewAdminRecords` and it is an administrator. That third is the same
   * grant the Staff listing, the attendance roster and the leave list use — a
   * roster somebody may page through and rows they may not then open would be a
   * screen at war with itself.
   *
   * **`SUPER_ADMIN` is unreachable by all three.** It is not `EMPLOYEE`, it is
   * not the viewer unless the owner is looking at themselves, and the grant
   * admits `ADMIN` alone. Reading the owner's record stays where it was.
   *
   * Refusals are *not found* rather than *forbidden*, so this cannot be used to
   * discover which ids belong to administrators by reading which refusal comes
   * back — the same phrasing the assistant's candidate search uses.
   *
   * Seeing is all this grants. `assertMayManage` is untouched, so every write
   * against an administrator account is still the super admin's alone.
   */
  async byIdForActor(id: string, actor: Actor): Promise<EmployeeDto> {
    const employee = await this.byId(id);

    if (employee.role === Role.EMPLOYEE || employee.id === actor.id || isSuperAdminRole(actor.role)) {
      return employee;
    }

    if (employee.role === Role.ADMIN && (await populationService.mayViewAdminRecords(actor))) {
      return employee;
    }

    throw new NotFoundError("Employee not found.");
  },

  /** Completes the post-verification profile step. */
  async completeProfile(employeeId: string, input: ProfileSetupInput): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    const updated = await employeeRepository.update(employeeId, {
      phone: input.phone,
      department: input.department,
      position: input.position,
      joiningDate: toUtcDay(input.joiningDate),
      ...(input.profilePhoto ? { profilePhoto: input.profilePhoto } : {}),
    });

    await emailService.sendProfileUpdated(updated.email, updated.name, "you");
    return updated;
  },

  /**
   * Self-service profile edit.
   *
   * **The super admin has full authority over their own account here, and it is
   * the only account that does.** `assertMayManage` refuses every edit of a
   * `SUPER_ADMIN` row from the dashboard — rightly, since nothing should be able
   * to suspend or retitle the owner — but that left the name, address and job
   * title of that one account unreachable by anybody at all, itself included.
   * Everyone else has somebody senior to ask; the owner has nobody, so the
   * authority lands here instead of nowhere.
   *
   * Both grants are decided against `employee.role` read from the database, not
   * a role carried in the session, so a demoted account loses them on the next
   * request rather than when a week-old token expires.
   */
  async updateOwnProfile(employeeId: string, input: ProfileUpdateInput): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    const owner = isSuperAdminRole(employee.role);

    // The lock, enforced here rather than only in the form. `ProfileForm`
    // renders read-only when it sees one, but that is a courtesy exactly as the
    // read-only job title is — this is the rule, so a hand-made request cannot
    // edit around a frozen profile. Checked before anything else is judged: a
    // locked account has no business reaching the email or job-title questions
    // below, and refusing for the real reason beats refusing for a later one.
    //
    // The owner is exempt because nothing can lock them in the first place —
    // `assertMayManage` refuses a SUPER_ADMIN target — so this can never be the
    // thing that puts the one account with nobody to appeal to out of its own
    // reach.
    if (employee.profileLockedAt && !owner) {
      throw new ForbiddenError(
        employee.profileLockReason
          ? `Your profile is locked by an administrator: ${employee.profileLockReason}`
          : "Your profile is locked by an administrator and cannot be edited until they unlock it.",
      );
    }

    const email = input.email !== undefined ? normalizeEmail(input.email) : undefined;
    const changingEmail = email !== undefined && email !== employee.email;

    // Submitting the address you already have is not a change, so it is not
    // refused — the form echoes the field back whether or not it was touched.
    if (changingEmail) {
      if (!owner) {
        throw new ForbiddenError("Your email address is changed by an administrator.");
      }

      const clash = await employeeRepository.findByEmail(email);
      if (clash) throw new ConflictError("Another account already uses that email address.");
    }

    // The title is assigned rather than claimed. `ProfileForm` renders it
    // read-only once set, but that is a courtesy — this is the rule, so a
    // hand-made request cannot award somebody a job title they were not given.
    // An empty one is still claimable, which is what profile setup writes.
    if (
      input.position !== undefined &&
      input.position !== employee.position &&
      employee.position &&
      !owner
    ) {
      throw new ForbiddenError("Your job title is set by an administrator.");
    }

    const updated = await employeeRepository.update(employeeId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(email !== undefined ? { email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.joiningDate !== undefined ? { joiningDate: toUtcDay(input.joiningDate) } : {}),
      ...(input.profilePhoto !== undefined ? { profilePhoto: input.profilePhoto || null } : {}),
    });

    await emailService.sendProfileUpdated(updated.email, updated.name, "you");
    return updated;
  },

  /**
   * Admin edit — may change email and account status.
   *
   * Guarded like the destructive actions: changing an address is the first half
   * of an account takeover, since the new address can then be used to reset the
   * password.
   */
  async adminUpdate(employeeId: string, input: AdminEmployeeUpdateInput, actor: Actor): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    assertMayManage(actor, employee);

    if (input.email && normalizeEmail(input.email) !== employee.email) {
      const clash = await employeeRepository.findByEmail(input.email);
      if (clash) throw new ConflictError("Another account already uses that email address.");
    }

    const statusChanged = input.status !== undefined && input.status !== employee.status;

    const updated = await employeeRepository.update(employeeId, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: normalizeEmail(input.email) } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.department !== undefined ? { department: input.department } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.joiningDate !== undefined ? { joiningDate: toUtcDay(input.joiningDate) } : {}),
      ...(input.profilePhoto !== undefined ? { profilePhoto: input.profilePhoto || null } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });

    if (statusChanged) {
      await emailService.sendAccountStatusChanged(
        updated.email,
        updated.name,
        updated.status === EmployeeStatus.SUSPENDED,
      );
    } else {
      await emailService.sendProfileUpdated(updated.email, updated.name, "an administrator");
    }

    return updated;
  },

  /**
   * Freezes somebody's own profile edits, or releases them.
   *
   * **Seniority is `assertMayManage`, unchanged**, which settles four questions
   * at once and for free: an ordinary administrator reaches employees only,
   * administrator accounts answer to the super admin, the owner is untouchable,
   * and nobody locks themselves. A second rule here would be a second place for
   * those to drift.
   *
   * **It is not a status, and it stops nothing else.** The account signs in,
   * marks attendance, books leave and is counted in every figure exactly as
   * before — the details are frozen, the person is not. Suspending is the other
   * thing, and it already exists.
   *
   * **An incomplete profile cannot be locked**, and that refusal is what stops a
   * trap rather than tidiness: `middleware.ts` sends anybody without a finished
   * profile to `/profile/setup` and keeps them there, so freezing one before it
   * is written would leave them unable to finish and unable to go anywhere else.
   * There is also nothing to freeze.
   */
  async setProfileLock(
    employeeId: string,
    locked: boolean,
    actor: Actor,
    reason: string | null = null,
  ): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    assertMayManage(actor, employee);

    if (locked && !isProfileComplete(employee)) {
      throw new ConflictError(
        "That profile has not been completed yet. Locking it now would leave them unable to finish it and unable to use anything else.",
      );
    }

    const alreadyLocked = employee.profileLockedAt !== null;
    if (alreadyLocked === locked) {
      throw new ConflictError(
        locked ? "That profile is already locked." : "That profile is not locked.",
      );
    }

    return employeeRepository.setProfileLock(
      employeeId,
      locked ? { by: actor.id, reason } : null,
    );
  },

  async setStatus(employeeId: string, status: EmployeeStatus, actor: Actor): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    // Replaces a blanket "administrators cannot be suspended": the super admin
    // now can, which is the point of managing them at all.
    assertMayManage(actor, employee);

    // Only settled accounts toggle. An administrator still awaiting a decision —
    // or already declined — belongs to the approval flow, which additionally
    // checks that the address was verified; letting a status toggle activate
    // them here would route around that.
    if (employee.status !== EmployeeStatus.ACTIVE && employee.status !== EmployeeStatus.SUSPENDED) {
      throw new ConflictError(
        "That account is still going through approval. Decide the request instead of changing its status.",
      );
    }

    if (employee.status === status) {
      throw new ConflictError(`This account is already ${status.toLowerCase()}.`);
    }

    const updated = await employeeRepository.update(employeeId, { status });
    await emailService.sendAccountStatusChanged(
      updated.email,
      updated.name,
      status === EmployeeStatus.SUSPENDED,
    );

    return updated;
  },

  /**
   * Deletes an account and, by cascade, its leave and OTP history.
   *
   * Deleting an administrator also cascades the invitations they sent, so the
   * record of who let a given employee in goes with them. Suspending is the
   * gentler option and is what the UI recommends.
   */
  async remove(employeeId: string, actor: Actor): Promise<EmployeeDto> {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("Employee not found.");

    assertMayManage(actor, employee);

    return employeeRepository.delete(employeeId);
  },

  list(filters: EmployeeListFilters) {
    return employeeRepository.list(filters);
  },

  departments(role?: Role) {
    return employeeRepository.distinctDepartments(role);
  },
};
