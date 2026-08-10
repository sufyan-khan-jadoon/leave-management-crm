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
import { emailService } from "@/services/email/email.service";
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

  /** `byId` for the admin dashboard, narrowed to what the viewer may see. */
  async byIdForActor(id: string, actor: Actor): Promise<EmployeeDto> {
    const employee = await this.byId(id);

    if (employee.role !== Role.EMPLOYEE && !isSuperAdminRole(actor.role) && employee.id !== actor.id) {
      throw new NotFoundError("Employee not found.");
    }

    return employee;
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
