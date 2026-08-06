import { randomBytes } from "node:crypto";

import { EmployeeStatus, Role } from "@prisma/client";

import { INVITE_TTL_DAYS } from "@/lib/constants";
import { isSuperAdminRole } from "@/lib/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { employeeRepository } from "@/repositories/employee.repository";
import { inviteRepository } from "@/repositories/invite.repository";
import { emailService } from "@/services/email/email.service";
import { jobRoleService } from "@/services/job-role.service";

/**
 * Readable but unguessable: 24 bytes of entropy in groups of four, so it can be
 * dictated over the phone without ambiguity.
 */
function generateKey(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(16);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");

  return (chars.match(/.{1,4}/g) ?? [chars]).join("-");
}

/** What a given viewer is allowed to hand out right now. */
export type IssuePermissions = { employee: boolean; admin: boolean };

/**
 * Who may hand out which key.
 *
 * Administrator keys are the super admin's alone — promoting someone to admin
 * cannot be delegated, so a single compromised admin account cannot quietly
 * widen its own circle. Employee keys need an explicit grant per administrator:
 * being an admin is not by itself permission to onboard people.
 *
 * The grant is read from the database on every call rather than taken from the
 * session, so revoking it takes effect on the very next request instead of
 * whenever that administrator's token happens to expire.
 */
async function permissionsFor(viewer: { id: string; role: Role }): Promise<IssuePermissions> {
  if (isSuperAdminRole(viewer.role)) return { employee: true, admin: true };

  const employee = await employeeRepository.findById(viewer.id);

  return { employee: Boolean(employee?.canInviteEmployees), admin: false };
}

export const inviteService = {
  permissionsFor,

  /** Issues a single-use key granting one role, and optionally a job title. */
  async issue(
    issuer: { id: string; role: Role },
    role: Role,
    jobRoleId: string | null,
    label: string | null,
  ) {
    const allowed = await permissionsFor(issuer);

    if (role === Role.ADMIN && !allowed.admin) {
      throw new ForbiddenError("Only a super administrator can invite administrators.");
    }

    if (role === Role.EMPLOYEE && !allowed.employee) {
      throw new ForbiddenError(
        "You do not have permission to invite employees. Ask your super administrator to enable it.",
      );
    }

    // Resolved now so a title deleted between opening the form and submitting
    // it is refused here, rather than silently producing a key with none.
    if (jobRoleId) await jobRoleService.nameFor(jobRoleId);

    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    return inviteRepository.create({
      key: generateKey(),
      role,
      jobRoleId,
      label,
      expiresAt,
      issuedById: issuer.id,
    });
  },

  /** Administrators the super admin can grant or withdraw invite rights for. */
  listAdmins() {
    return employeeRepository.listAdmins();
  },

  async setInvitePermission(adminId: string, allowed: boolean) {
    const employee = await employeeRepository.findById(adminId);
    if (!employee) throw new NotFoundError("That account no longer exists.");

    // Guards against handing the flag to an employee, where it would mean
    // nothing, or to the super admin, whose right is not stored here at all.
    if (employee.role !== Role.ADMIN) {
      throw new ConflictError("Invite permissions apply to administrators only.");
    }

    return employeeRepository.setInvitePermission(adminId, allowed);
  },

  /**
   * The super admin sees every key, since they own onboarding for the whole
   * organisation. An admin sees only the employee keys they issued themselves —
   * enough to chase up an invite they sent, without exposing admin onboarding.
   */
  list(viewer: { id: string; role: Role }) {
    return isSuperAdminRole(viewer.role)
      ? inviteRepository.list()
      : inviteRepository.list({ issuedById: viewer.id, role: Role.EMPLOYEE });
  },

  /**
   * Deletes a key nobody redeemed.
   *
   * Removed outright rather than flagged: an unredeemed key has no history worth
   * keeping — nobody joined through it — and leaving a tombstone behind only
   * grows a list whose whole job is to show what is currently outstanding. A key
   * that *was* redeemed is refused, because it is the record of how one of your
   * people got in.
   *
   * Open to whoever can already see the key, which means administrators can
   * clear up after themselves without asking.
   */
  async discard(id: string, viewer: { id: string; role: Role }) {
    const invite = await inviteRepository.findById(id);
    if (!invite) throw new NotFoundError("That invite key no longer exists.");

    // Scoped the same way as `list`, so a key an admin cannot see is also a key
    // they cannot delete — and the wording does not confirm it exists.
    if (!isSuperAdminRole(viewer.role) && (invite.issuedById !== viewer.id || invite.role !== Role.EMPLOYEE)) {
      throw new NotFoundError("That invite key no longer exists.");
    }

    if (invite.redeemedAt) {
      throw new ConflictError("That key has been used to create an account and cannot be deleted.");
    }

    return inviteRepository.delete(id);
  },

  /**
   * Validates a key at registration time without spending it.
   *
   * Every rejection reads the same, so the endpoint cannot be used to sort real
   * keys from invented ones by the wording of the error.
   */
  async assertUsable(key: string) {
    const invite = await inviteRepository.findByKey(key.trim().toUpperCase());
    const unusable = !invite || invite.revokedAt || invite.redeemedAt || invite.expiresAt <= new Date();

    if (unusable) {
      throw new ValidationError("That invite key is not valid. Ask your administrator for a new one.");
    }

    return invite!;
  },

  /** Spends a key, losing the race gracefully if two registrations collide. */
  async redeem(inviteId: string, employeeId: string) {
    const claimed = await inviteRepository.redeem(inviteId, employeeId);

    if (!claimed) {
      throw new ValidationError("That invite key is not valid. Ask your administrator for a new one.");
    }
  },

  /** Administrators still waiting on a decision, oldest first. */
  pendingAdmins() {
    return employeeRepository.listPendingAdmins();
  },

  /** Approves or refuses a pending administrator and tells them which. */
  async decide(employeeId: string, approve: boolean) {
    const employee = await employeeRepository.findById(employeeId);
    if (!employee) throw new NotFoundError("That account no longer exists.");

    if (employee.status !== EmployeeStatus.PENDING_APPROVAL) {
      throw new ConflictError("That request has already been decided.");
    }

    if (employee.role !== Role.ADMIN) {
      throw new ConflictError("Only administrator requests are decided here.");
    }

    // The queue already hides these, so reaching here means the endpoint was
    // called directly. Approving an unproven address would undo verification.
    if (!employee.emailVerified) {
      throw new ConflictError("That administrator has not verified their email address yet.");
    }

    const updated = await employeeRepository.updateStatus(
      employeeId,
      approve ? EmployeeStatus.ACTIVE : EmployeeStatus.REJECTED,
    );

    await emailService.sendAdminDecision(updated.email, updated.name, approve);

    return updated;
  },
};
