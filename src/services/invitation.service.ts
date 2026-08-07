import { EmployeeStatus, InvitationStatus, Role, type Invitation } from "@prisma/client";

import { INVITE_TTL_DAYS } from "@/lib/constants";
import { isSuperAdminRole, type InviteRole } from "@/lib/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { generateInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { employeeRepository, normalizeEmail } from "@/repositories/employee.repository";
import { invitationRepository, type InvitationDto } from "@/repositories/invitation.repository";
import { emailService } from "@/services/email/email.service";
import { jobRoleService } from "@/services/job-role.service";

/** What a given viewer is allowed to hand out right now. */
export type IssuePermissions = { employee: boolean; admin: boolean };

/** An invitation plus whether the email carrying it actually went out. */
export type InvitationResult = { invitation: InvitationDto; emailSent: boolean };

/**
 * What the registration screen is told about a link before anyone fills in a
 * form. Every branch but `valid` is a dead end with its own way forward, so the
 * recipient of a lapsed link is not left guessing whether they mistyped it.
 */
export type InvitationPreview =
  | {
      state: "valid";
      email: string;
      role: InviteRole;
      jobTitle: string | null;
      expiresAt: Date;
    }
  | { state: "expired" | "accepted" | "invalid" };

function expiresAtFromNow(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function hasLapsed(invitation: Invitation): boolean {
  return invitation.expiresAt <= new Date();
}

/**
 * Who may invite whom.
 *
 * Administrators are the super admin's alone to invite — promoting someone
 * cannot be delegated, so a single compromised admin account cannot quietly
 * widen its own circle. Inviting employees needs an explicit grant per
 * administrator: being an admin is not by itself permission to onboard people.
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

async function assertMayInvite(issuer: { id: string; role: Role }, role: Role): Promise<void> {
  const allowed = await permissionsFor(issuer);

  if (role === Role.ADMIN && !allowed.admin) {
    throw new ForbiddenError("Only a super administrator can invite administrators.");
  }

  if (role === Role.EMPLOYEE && !allowed.employee) {
    throw new ForbiddenError(
      "You do not have permission to invite employees. Ask your super administrator to enable it.",
    );
  }
}

/**
 * Whether a viewer is entitled to act on one particular invitation.
 *
 * Scoped exactly as `list` is, so an invitation an admin cannot see is also one
 * they cannot resend, withdraw or overwrite.
 */
function inScope(viewer: { id: string; role: Role }, invitation: Invitation): boolean {
  return (
    isSuperAdminRole(viewer.role) ||
    (invitation.invitedById === viewer.id && invitation.role === Role.EMPLOYEE)
  );
}

/**
 * Mails the link and reports whether it left, without failing the invitation.
 *
 * Delivery is not allowed to throw — the same rule the rest of the app follows —
 * but it is reported, because unlike a leave confirmation an invitation that
 * never arrives is the whole of the thing, and the administrator is the only
 * person in a position to notice and resend.
 */
async function deliver(invitation: InvitationDto, token: string): Promise<InvitationResult> {
  const emailSent = await emailService.sendInvitation(invitation.email, {
    role: invitation.role,
    jobTitle: invitation.jobRole?.name ?? null,
    // Read from the database rather than the session, which was written at
    // sign-in and may name someone who has since been renamed.
    inviterName: invitation.invitedBy.name,
    token,
    expiresAt: invitation.expiresAt,
  });

  return { invitation, emailSent };
}

export const invitationService = {
  permissionsFor,

  /**
   * Invites one address to register as one role, and mails them the link.
   *
   * The address is refused if it already has an account or an open invitation —
   * re-inviting somebody is `resend`, which reuses the row rather than leaving
   * two live links to the same mailbox. An invitation that has lapsed is
   * replaced in place, so a stale row never locks an address out for good.
   */
  async invite(
    issuer: { id: string; role: Role },
    input: { email: string; role: InviteRole; jobRoleId: string | null },
  ): Promise<InvitationResult> {
    await assertMayInvite(issuer, input.role);

    const email = normalizeEmail(input.email);

    // Resolved now so a title deleted between opening the form and submitting it
    // is refused here, rather than silently producing an invitation with none.
    if (input.jobRoleId) await jobRoleService.nameFor(input.jobRoleId);

    const existingAccount = await employeeRepository.findByEmail(email);
    if (existingAccount) {
      throw new ConflictError("That email address already has an account.");
    }

    const { token, tokenHash } = generateInvitationToken();
    const shared = { tokenHash, role: input.role, jobRoleId: input.jobRoleId, expiresAt: expiresAtFromNow() };

    const existing = await invitationRepository.findByEmail(email);

    if (existing) {
      // Accepted, yet no account came back from the lookup above — the account
      // was deleted and the row is on its way out with it. Nothing to reuse.
      if (existing.status === InvitationStatus.ACCEPTED) {
        throw new ConflictError("That email address has already used an invitation.");
      }

      // A live invitation is left alone — resending is how you chase one up. So
      // is one the caller may not see, worded identically so an administrator
      // cannot learn from the refusal that the super admin invited this address
      // as somebody more senior.
      if (!hasLapsed(existing) || !inScope(issuer, existing)) {
        throw new ConflictError(
          "That address already has an open invitation. Resend it instead of creating another.",
        );
      }

      const reissued = await invitationRepository.reissue(existing.id, { ...shared, invitedById: issuer.id });
      return deliver(reissued, token);
    }

    const created = await invitationRepository.create({ email, ...shared, invitedById: issuer.id });

    // Null means the unique index refused it: another administrator invited the
    // same address between the check above and this insert.
    if (!created) {
      throw new ConflictError("That address has just been invited by someone else.");
    }

    return deliver(created, token);
  },

  /**
   * Sends the invitation again with a fresh link.
   *
   * The old token stops working: a resend is what you do when the first mail
   * went astray or the invitation lapsed, and leaving two live links to one
   * mailbox would mean withdrawing an invitation no longer withdrew it.
   */
  async resend(id: string, viewer: { id: string; role: Role }): Promise<InvitationResult> {
    const invitation = await invitationRepository.findById(id);
    if (!invitation || !inScope(viewer, invitation)) {
      throw new NotFoundError("That invitation no longer exists.");
    }

    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictError("That invitation has already been accepted.");
    }

    // Re-checked rather than assumed from the original: the right to invite may
    // have been withdrawn since, and a resend is a fresh act of onboarding.
    await assertMayInvite(viewer, invitation.role);

    const { token, tokenHash } = generateInvitationToken();
    const reissued = await invitationRepository.reissue(invitation.id, {
      tokenHash,
      role: invitation.role,
      jobRoleId: invitation.jobRoleId,
      expiresAt: expiresAtFromNow(),
      invitedById: viewer.id,
    });

    return deliver(reissued, token);
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
   * The super admin sees every invitation, since they own onboarding for the
   * whole organisation. An admin sees only the employees they invited
   * themselves — enough to chase one up, without exposing admin onboarding.
   */
  list(viewer: { id: string; role: Role }) {
    return isSuperAdminRole(viewer.role)
      ? invitationRepository.list()
      : invitationRepository.list({ invitedById: viewer.id, role: Role.EMPLOYEE });
  },

  /**
   * Withdraws an invitation nobody accepted, and with it the emailed link.
   *
   * Removed outright rather than flagged: an unaccepted invitation has no
   * history worth keeping — nobody joined through it — and a tombstone would
   * only grow a list whose whole job is to show what is currently outstanding.
   * One that *was* accepted is refused, because it is the record of how one of
   * your people got in.
   *
   * Open to whoever can already see it, so administrators can clear up after
   * themselves without asking.
   */
  async withdraw(id: string, viewer: { id: string; role: Role }) {
    const invitation = await invitationRepository.findById(id);

    // Scoped the same way as `list`, and the wording does not confirm that an
    // invitation the caller may not see exists at all.
    if (!invitation || !inScope(viewer, invitation)) {
      throw new NotFoundError("That invitation no longer exists.");
    }

    // Protected only while the account it created still exists — that is what
    // it is the record of. Once the account is gone the row cascades away with
    // it, so there is nothing here to clear up by hand.
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ConflictError("That invitation was used to create an account and cannot be withdrawn.");
    }

    return invitationRepository.delete(id);
  },

  /**
   * Looks up the invitation a link refers to, without spending it.
   *
   * Registration re-checks and accepts it, so abandoning the form leaves the
   * link usable.
   */
  async forToken(token: string): Promise<Invitation> {
    const invitation = await invitationRepository.findByTokenHash(hashInvitationToken(token));

    if (!invitation) {
      throw new ValidationError("That invitation link is not valid. Ask your administrator for a new one.");
    }

    return invitation;
  },

  /** Refuses an invitation that has been spent or has run out of time. */
  assertUsable(invitation: Invitation): void {
    if (invitation.status === InvitationStatus.ACCEPTED) {
      throw new ValidationError("That invitation has already been used. Sign in instead.");
    }

    if (hasLapsed(invitation)) {
      throw new ValidationError("That invitation has expired. Ask your administrator for a new one.");
    }
  },

  /**
   * Describes a link for the registration screen.
   *
   * Reports rather than throws, because every outcome here is a page to render:
   * the recipient is holding a link they were sent, and "expired" and "already
   * used" each have a different way forward.
   */
  async preview(token: string): Promise<InvitationPreview> {
    const invitation = await invitationRepository.findByTokenHash(hashInvitationToken(token));
    if (!invitation) return { state: "invalid" };

    if (invitation.status === InvitationStatus.ACCEPTED) return { state: "accepted" };
    if (hasLapsed(invitation)) return { state: "expired" };

    // Read from the job role rather than stored on the invitation, so a title
    // renamed since it was sent shows the name the account will actually get.
    const jobTitle = invitation.jobRoleId
      ? await jobRoleService.nameFor(invitation.jobRoleId).catch(() => null)
      : null;

    return {
      state: "valid",
      email: invitation.email,
      // Narrowed safely: SUPER_ADMIN is never issuable, so an invitation only
      // ever holds one of the two roles the screens know how to describe.
      role: invitation.role === Role.ADMIN ? Role.ADMIN : Role.EMPLOYEE,
      jobTitle,
      expiresAt: invitation.expiresAt,
    };
  },

  /** Spends an invitation, losing the race gracefully if two registrations collide. */
  async accept(invitationId: string, employeeId: string): Promise<void> {
    const claimed = await invitationRepository.accept(invitationId, employeeId);

    if (!claimed) {
      throw new ValidationError("That invitation has already been used. Sign in instead.");
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
