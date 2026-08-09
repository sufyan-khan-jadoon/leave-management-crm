import { EmailAudience, EmailDispatchStatus, Role } from "@prisma/client";

import { MAX_EMAIL_RECIPIENTS } from "@/lib/constants";
import {
  audienceRoles,
  individualRecipientRoles,
  maySendAnything,
  permittedAudiences,
} from "@/lib/email-audience";
import { isSuperAdminRole } from "@/lib/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasVisibleText, htmlToPlainText, sanitizeEmailHtml } from "@/lib/sanitize-html";
import {
  emailDispatchRepository,
  type EmailDispatchDto,
} from "@/repositories/email-dispatch.repository";
import { employeeRepository, type MailRecipient } from "@/repositories/employee.repository";
import { emailService } from "@/services/email/email.service";
import type { EmailLogQuery, SendCustomEmailInput } from "@/validations/email.schema";

/** Who is asking. The same shape the holiday and invitation rules take. */
export type EmailActor = { id: string; role: Role };

/** What one send amounted to, as the composer reports it back. */
export type SendResult = {
  audience: EmailAudience;
  recipientCount: number;
  deliveredCount: number;
  status: EmailDispatchStatus;
  /** Phrased for the person who pressed the button. */
  message: string;
};

/**
 * What this caller may do, for the screen to shape itself around.
 *
 * Mirrors the real checks below and never replaces them — the same split
 * `/api/admin/holidays` uses when it returns `canManage`.
 */
export type EmailCapabilities = {
  canSend: boolean;
  audiences: EmailAudience[];
  /** True for the super admin, whose log covers everybody's sends rather than their own. */
  seesAllHistory: boolean;
};

/**
 * The grant, read fresh from the database.
 *
 * Never from the session, exactly as `canInviteEmployees` and
 * `canManageHolidays` are not: withdrawing the right has to stop the next send
 * rather than wait for a week-old token to expire. Don't "optimise" it into the
 * JWT. The super admin's own right is not stored — it is their role.
 */
async function grantFor(actor: EmailActor): Promise<boolean> {
  if (isSuperAdminRole(actor.role)) return true;
  if (actor.role !== Role.ADMIN) return false;

  const employee = await employeeRepository.findById(actor.id);
  return Boolean(employee?.canSendEmails);
}

/**
 * What this caller may address.
 *
 * The rule itself lives in `lib/email-audience.ts`, free of Prisma so the whole
 * matrix can be enumerated in a test without a database. This function's only
 * job is to fetch the grant and hand it over — so the answer a test proves is
 * the same answer a send gets.
 */
async function audiencesFor(actor: EmailActor): Promise<EmailAudience[]> {
  return permittedAudiences(actor.role, await grantFor(actor)) as EmailAudience[];
}

async function maySend(actor: EmailActor): Promise<boolean> {
  return maySendAnything(actor.role, await grantFor(actor));
}

function individualRolesFor(actor: EmailActor): Role[] {
  return individualRecipientRoles(actor.role);
}

async function assertMaySend(actor: EmailActor): Promise<void> {
  if (await maySend(actor)) return;

  throw new ForbiddenError(
    actor.role === Role.ADMIN
      ? "You do not have permission to send emails. Ask your super administrator to enable it."
      : "Only administrators can send emails.",
  );
}

/**
 * Resolves an audience to actual addresses, refusing one this caller may not use.
 *
 * The two checks are separate on purpose. The first is "may you send at all",
 * the second is "may you send to *these people*" — an administrator who has been
 * granted the right still cannot reach ALL_MEMBERS by putting it in the request
 * body, because the permitted set is computed here from their role rather than
 * compared against anything they sent.
 */
async function resolveRecipients(
  actor: EmailActor,
  input: SendCustomEmailInput,
): Promise<{ recipients: MailRecipient[]; individual: MailRecipient | null }> {
  const permitted = await audiencesFor(actor);

  if (!permitted.includes(input.audience)) {
    throw new ForbiddenError(
      input.audience === EmailAudience.ALL_MEMBERS || input.audience === EmailAudience.ADMINS
        ? "Only the super administrator can send to that audience."
        : "You do not have permission to send to that audience.",
    );
  }

  if (input.audience === EmailAudience.INDIVIDUAL) {
    // `recipientId` is guaranteed present by the schema for this audience.
    const recipient = await employeeRepository.findMailRecipient(
      input.recipientId!,
      individualRolesFor(actor),
    );

    // Phrased as not-found rather than forbidden so the endpoint cannot be used
    // to discover which ids belong to accounts the caller may not address — the
    // same wording `assertMayManage` uses on reads.
    if (!recipient) throw new NotFoundError("That person is not available to email.");
    if (recipient.id === actor.id) {
      throw new ValidationError("You cannot send a message to yourself.", {
        recipientId: "Choose somebody else.",
      });
    }

    return { recipients: [recipient], individual: recipient };
  }

  const roles = audienceRoles(input.audience);
  const recipients = await employeeRepository.listMailRecipients(roles, actor.id);

  return { recipients, individual: null };
}

export const customEmailService = {
  maySend,

  async capabilities(actor: EmailActor): Promise<EmailCapabilities> {
    const audiences = await audiencesFor(actor);

    return {
      canSend: audiences.length > 0,
      audiences,
      seesAllHistory: isSuperAdminRole(actor.role),
    };
  },

  /**
   * People this caller may pick from, for the Individual option.
   *
   * Addresses are deliberately **not** returned. The picker needs a name, a role
   * and a department to tell two people apart; handing it every mailbox in the
   * organisation would turn a compose box into a directory export, and the
   * server is the only thing that needs to know where the message is going.
   */
  async recipientOptions(
    actor: EmailActor,
    search?: string,
  ): Promise<Array<{ id: string; name: string; role: Role; department: string | null }>> {
    await assertMaySend(actor);

    const people = await employeeRepository.listMailRecipients(individualRolesFor(actor), actor.id);
    const term = search?.trim().toLowerCase();

    return people
      .filter(
        (person) =>
          !term ||
          person.name.toLowerCase().includes(term) ||
          (person.department ?? "").toLowerCase().includes(term),
      )
      .map(({ id, name, role, department }) => ({ id, name, role, department }));
  },

  /**
   * Writes one custom email and records that it happened.
   *
   * The body is sanitised here rather than at the edge, because this is the last
   * point before it becomes an outgoing message and the only point that knows it
   * is HTML bound for a mail client. The plain-text part is derived from the
   * sanitised markup, never from the original, so a stripped script can never
   * survive in the half of the message nobody looks at.
   *
   * Delivery failures do not throw. Mail is fire-and-forget everywhere here, and
   * a bounced mailbox out of forty is not a failed announcement — it is a
   * PARTIAL, which is what the log exists to be able to say.
   */
  async send(actor: EmailActor, input: SendCustomEmailInput): Promise<SendResult> {
    await assertMaySend(actor);

    const html = sanitizeEmailHtml(input.body);

    // Checked after sanitising, not before: a body made entirely of markup the
    // allowlist removes is an empty message, however long the string arrived.
    if (!hasVisibleText(html)) {
      throw new ValidationError("Write a message before sending.", { body: "The message is empty." });
    }

    const { recipients, individual } = await resolveRecipients(actor, input);

    if (recipients.length === 0) {
      throw new ValidationError("There is nobody to send that to.", {
        audience: "No active, verified accounts match that audience.",
      });
    }

    if (recipients.length > MAX_EMAIL_RECIPIENTS) {
      throw new ValidationError(
        `That would write to ${recipients.length} people, over the ${MAX_EMAIL_RECIPIENTS} limit for one send.`,
        { audience: "Narrow the audience." },
      );
    }

    const sender = await employeeRepository.findById(actor.id);
    if (!sender) throw new NotFoundError("Your account no longer exists.");

    const text = htmlToPlainText(html);

    const results = await Promise.all(
      recipients.map((recipient) =>
        emailService.sendCustomEmail(recipient.email, {
          recipientName: recipient.name,
          senderName: sender.name,
          subject: input.subject,
          html,
          text,
        }),
      ),
    );

    const deliveredCount = results.filter(Boolean).length;

    const status =
      deliveredCount === 0
        ? EmailDispatchStatus.FAILED
        : deliveredCount < recipients.length
          ? EmailDispatchStatus.PARTIAL
          : EmailDispatchStatus.SENT;

    await emailDispatchRepository.create({
      senderId: actor.id,
      audience: input.audience,
      subject: input.subject,
      recipientCount: recipients.length,
      deliveredCount,
      status,
      recipientId: individual?.id ?? null,
    });

    return {
      audience: input.audience,
      recipientCount: recipients.length,
      deliveredCount,
      status,
      message: describeOutcome(status, deliveredCount, recipients.length, individual?.name),
    };
  },

  /**
   * The audit trail.
   *
   * An administrator sees only what they sent; the super admin sees everything.
   * That asymmetry is the point of the log — it answers "who wrote to the
   * organisation", and an administrator able to read their colleagues' sends
   * would be using it for something else.
   */
  async history(
    actor: EmailActor,
    query: EmailLogQuery,
  ): Promise<{ items: EmailDispatchDto[]; total: number }> {
    await assertMaySend(actor);

    return emailDispatchRepository.list({
      ...query,
      ...(isSuperAdminRole(actor.role) ? {} : { senderId: actor.id }),
    });
  },

  /**
   * Grants or withdraws the right for one administrator.
   *
   * Guarded by `requireSuperAdmin` in the route, the same as the other two
   * grants — an administrator cannot reach this, so there is no path by which
   * one could widen their own permissions or hand the right to a colleague.
   */
  async setPermission(adminId: string, allowed: boolean) {
    const employee = await employeeRepository.findById(adminId);
    if (!employee) throw new NotFoundError("That account no longer exists.");

    if (employee.role !== Role.ADMIN) {
      throw new ForbiddenError("Email permissions apply to administrators only.");
    }

    return employeeRepository.setEmailPermission(adminId, allowed);
  },
};

function describeOutcome(
  status: EmailDispatchStatus,
  delivered: number,
  total: number,
  individualName?: string,
): string {
  const who = individualName ?? `${total} ${total === 1 ? "person" : "people"}`;

  if (status === EmailDispatchStatus.SENT) return `Sent to ${who}.`;
  if (status === EmailDispatchStatus.FAILED) {
    return `Couldn't deliver that message to ${who}. Nothing was sent — check the mail settings and try again.`;
  }

  return `Sent to ${delivered} of ${total}. ${total - delivered} ${total - delivered === 1 ? "address" : "addresses"} could not be reached.`;
}
