import { randomBytes } from "node:crypto";

import { EmployeeStatus, Role } from "@prisma/client";

import { ADMIN_INVITE_TTL_DAYS } from "@/lib/constants";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { employeeRepository } from "@/repositories/employee.repository";
import { inviteRepository } from "@/repositories/invite.repository";
import { emailService } from "@/services/email/email.service";

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

export const inviteService = {
  /** Issues a single-use key for one prospective administrator. */
  async issue(superAdminId: string, label: string | null) {
    const expiresAt = new Date(Date.now() + ADMIN_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    return inviteRepository.create({ key: generateKey(), label, expiresAt, issuedById: superAdminId });
  },

  list(superAdminId: string) {
    return inviteRepository.list(superAdminId);
  },

  async revoke(id: string) {
    const invite = await inviteRepository.findById(id);
    if (!invite) throw new NotFoundError("That invite key no longer exists.");

    if (invite.redeemedAt) {
      throw new ConflictError("That key has already been used and cannot be revoked.");
    }

    return inviteRepository.revoke(id);
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
      throw new ValidationError("That invite key is not valid. Ask your super administrator for a new one.");
    }

    return invite!;
  },

  /** Spends a key, losing the race gracefully if two registrations collide. */
  async redeem(inviteId: string, employeeId: string) {
    const claimed = await inviteRepository.redeem(inviteId, employeeId);

    if (!claimed) {
      throw new ValidationError("That invite key is not valid. Ask your super administrator for a new one.");
    }
  },

  /** Administrators still waiting on a decision, oldest first. */
  pendingAdmins() {
    return employeeRepository.listByStatus(EmployeeStatus.PENDING_APPROVAL);
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

    const updated = await employeeRepository.updateStatus(
      employeeId,
      approve ? EmployeeStatus.ACTIVE : EmployeeStatus.REJECTED,
    );

    await emailService.sendAdminDecision(updated.email, updated.name, approve);

    return updated;
  },
};
