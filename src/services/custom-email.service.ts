import { EmailAudience, EmailDispatchStatus, Role } from "@prisma/client";

import { MAX_EMAIL_RECIPIENTS } from "@/lib/constants";
import {
  EMAIL_AUDIENCE,
  NO_EMAIL_GRANTS,
  audienceRoles,
  individualRecipientRoles,
  mayEmailAdmins,
  maySendAnything,
  permittedAudiences,
  type EmailGrants,
} from "@/lib/email-audience";
import { judgeAttachments } from "@/lib/email-attachments";
import { isSuperAdminRole } from "@/lib/enums";
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import { hasVisibleText, htmlToPlainText, sanitizeEmailHtml } from "@/lib/sanitize-html";
import {
  emailDispatchRepository,
  type EmailDispatchDto,
} from "@/repositories/email-dispatch.repository";
import { employeeRepository, type MailRecipient } from "@/repositories/employee.repository";
import { emailService, type MailAttachment } from "@/services/email/email.service";
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
  /**
   * Named separately from `seesAllHistory` even though both are the super admin
   * today. Reading the trail and destroying it are different rights, and one flag
   * standing for both is how a later change to either quietly moves the other.
   */
  canClearHistory: boolean;
};

/**
 * The grants, read fresh from the database.
 *
 * Never from the session, exactly as `canInviteEmployees` and
 * `canManageHolidays` are not: withdrawing a right has to stop the next send
 * rather than wait for a week-old token to expire. Don't "optimise" either of
 * them into the JWT. The super admin's own rights are not stored — they are
 * their role, which is why the flags are not even read for them.
 *
 * Both come off one row, so the two questions an administrator's send asks —
 * may you send, and may you send to administrators — cost one query between
 * them rather than one each.
 */
async function grantsFor(actor: EmailActor): Promise<EmailGrants> {
  if (isSuperAdminRole(actor.role)) return NO_EMAIL_GRANTS;
  if (actor.role !== Role.ADMIN) return NO_EMAIL_GRANTS;

  const employee = await employeeRepository.findById(actor.id);

  return {
    canSendEmails: Boolean(employee?.canSendEmails),
    canEmailAdmins: Boolean(employee?.canEmailAdmins),
  };
}

/**
 * What this caller may address.
 *
 * The rule itself lives in `lib/email-audience.ts`, free of Prisma so the whole
 * matrix can be enumerated in a test without a database. This function's only
 * job is to fetch the grants and hand them over — so the answer a test proves is
 * the same answer a send gets.
 */
async function audiencesFor(actor: EmailActor): Promise<EmailAudience[]> {
  return permittedAudiences(actor.role, await grantsFor(actor)) as EmailAudience[];
}

async function maySend(actor: EmailActor): Promise<boolean> {
  return maySendAnything(actor.role, await grantsFor(actor));
}

/**
 * The one-person picker's population, narrowed by the admin grant.
 *
 * Takes the grants rather than fetching them, because every caller has already
 * paid for the row — and because a second read here could disagree with the one
 * that decided the audience a moment earlier.
 */
function individualRolesFor(actor: EmailActor, grants: EmailGrants): Role[] {
  return individualRecipientRoles(actor.role, grants);
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
 * Refuses anyone who may not write to administrators, by any route.
 *
 * Guards the administrator picker, which is the read half of the feature. The
 * write half is guarded by `resolveRecipients` computing the permitted audiences
 * from the role rather than comparing against what was sent — so this is not the
 * only thing standing between a hand-made request and a send, and it is not
 * relied upon as if it were.
 */
async function assertMayEmailAdmins(actor: EmailActor): Promise<void> {
  if (mayEmailAdmins(actor.role, await grantsFor(actor))) return;

  throw new ForbiddenError(
    actor.role === Role.ADMIN
      ? "You do not have permission to email administrators. Ask your super administrator to enable it."
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
  const grants = await grantsFor(actor);
  const permitted = permittedAudiences(actor.role, grants) as EmailAudience[];

  if (!permitted.includes(input.audience)) {
    throw new ForbiddenError(refusalFor(input.audience, actor.role));
  }

  if (input.audience === EmailAudience.INDIVIDUAL) {
    // `recipientId` is guaranteed present by the schema for this audience.
    const recipient = await employeeRepository.findMailRecipient(
      input.recipientId!,
      individualRolesFor(actor, grants),
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

  if (input.audience === EmailAudience.SELECTED_ADMINS) {
    // `recipientIds` is guaranteed present and non-empty by the schema here.
    const chosen = input.recipientIds!;

    // Resolved **within** the audience's own population rather than by id alone,
    // which is what makes a manipulated payload inert: an employee's id, a
    // suspended account, an unverified address or the super admin's id posted
    // into this list resolves to nobody, so the widest a forged request can
    // reach is still the administrators this caller was already allowed.
    const recipients = await employeeRepository.listMailRecipientsByIds(chosen, roles, actor.id);

    // Reported rather than shrugged off. A send that quietly covered four of the
    // five people somebody picked is indistinguishable from one they meant, and
    // an email cannot be recalled to add the person who was dropped — the same
    // argument `missingSelections` makes in the report builder, with the higher
    // stakes of actually delivering something.
    if (recipients.length !== chosen.length) {
      const missing = chosen.length - recipients.length;

      throw new ValidationError(
        `${missing} of the ${chosen.length} chosen ${missing === 1 ? "recipient is" : "recipients are"} no longer available to email.`,
        {
          recipientIds:
            "Somebody you picked is not an active administrator you may write to. Refresh the list and choose again.",
        },
      );
    }

    return { recipients, individual: null };
  }

  const recipients = await employeeRepository.listMailRecipients(roles, actor.id);

  return { recipients, individual: null };
}

/**
 * Why an audience was refused, without saying more than the caller may know.
 *
 * Each names the grant that would unlock it, because "you may not" with nothing
 * after it sends somebody hunting for whoever can help. ALL_MEMBERS is the one
 * that names a person instead, being the audience no grant reaches.
 */
function refusalFor(audience: EmailAudience, role: Role): string {
  if (role !== Role.ADMIN) return "Only administrators can send emails.";

  if (audience === EmailAudience.ALL_MEMBERS) {
    return "Only the super administrator can send to everybody at once.";
  }

  if (audience === EmailAudience.ADMINS || audience === EmailAudience.SELECTED_ADMINS) {
    return "You do not have permission to email administrators. Ask your super administrator to enable it.";
  }

  return "You do not have permission to send to that audience.";
}

/**
 * Turns the uploaded files into MIME parts, refusing the ones that may not go.
 *
 * The composer runs the same rules over the same files before the send button
 * does anything, and that check is a courtesy — this is the one that decides,
 * for the reason `sanitizeEmailHtml` re-parses what the editor produced. A
 * hand-made request carrying `payroll.exe` reaches exactly here.
 *
 * It judges `file.size`, which is the length of the part the runtime actually
 * parsed rather than a number the browser wrote down, and it takes the content
 * type from the sanitised filename rather than from `file.type`, which is a
 * claim. Bytes are read only after the whole set has passed, so an oversized or
 * forbidden file is never buffered at all.
 */
async function readAttachments(files: File[]): Promise<MailAttachment[]> {
  if (files.length === 0) return [];

  const verdict = judgeAttachments(files.map((file) => ({ name: file.name, size: file.size })));

  if (!verdict.ok) {
    throw new ValidationError(verdict.message, { attachments: verdict.message });
  }

  return Promise.all(
    verdict.files.map(async (judged, index) => ({
      filename: judged.filename,
      contentType: judged.contentType,
      content: Buffer.from(await files[index]!.arrayBuffer()),
    })),
  );
}

export const customEmailService = {
  maySend,

  async capabilities(actor: EmailActor): Promise<EmailCapabilities> {
    const audiences = await audiencesFor(actor);

    return {
      canSend: audiences.length > 0,
      audiences,
      seesAllHistory: isSuperAdminRole(actor.role),
      canClearHistory: isSuperAdminRole(actor.role),
    };
  },

  /**
   * People this caller may pick from — for one of the two pickers.
   *
   * `scope` says which is asking, and each has its own permission check and its
   * own population: INDIVIDUAL offers whoever `individualRecipientRoles` allows,
   * ADMINS offers exactly the population "all administrators" would resolve to,
   * so the searchable list and the group send can never mean different sets of
   * people. The scope cannot widen anything — it selects a branch, and the
   * branch does the asserting.
   *
   * Addresses are deliberately **not** returned. The picker needs a name, a role
   * and a department to tell two people apart; handing it every mailbox in the
   * organisation would turn a compose box into a directory export, and the
   * server is the only thing that needs to know where the message is going.
   */
  async recipientOptions(
    actor: EmailActor,
    options: { search?: string; scope?: "INDIVIDUAL" | "ADMINS" } = {},
  ): Promise<Array<{ id: string; name: string; role: Role; department: string | null }>> {
    const scope = options.scope ?? "INDIVIDUAL";

    let roles: Role[];

    if (scope === "ADMINS") {
      await assertMayEmailAdmins(actor);
      // Asks the audience for its population rather than naming `ADMIN` here,
      // so the picker offers exactly who "all administrators" would resolve to.
      roles = audienceRoles(EMAIL_AUDIENCE.ADMINS);
    } else {
      await assertMaySend(actor);
      roles = individualRolesFor(actor, await grantsFor(actor));
    }

    const people = await employeeRepository.listMailRecipients(roles, actor.id);
    const term = options.search?.trim().toLowerCase();

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
   *
   * Attachments are the exception to that tolerance in one direction only: a
   * file that may not be sent stops the message before anybody is written to,
   * because a message that went out without the document it promised cannot be
   * recalled to add it. A file the *mail host* then rejects is an ordinary
   * delivery failure and reads as one.
   */
  async send(
    actor: EmailActor,
    input: SendCustomEmailInput,
    files: File[] = [],
  ): Promise<SendResult> {
    await assertMaySend(actor);

    const html = sanitizeEmailHtml(input.body);

    // Checked after sanitising, not before: a body made entirely of markup the
    // allowlist removes is an empty message, however long the string arrived.
    if (!hasVisibleText(html)) {
      throw new ValidationError("Write a message before sending.", { body: "The message is empty." });
    }

    // Before the audience is resolved: whether these files may be sent has
    // nothing to do with who they were going to, and finding out costs a
    // database round trip that a refused message does not need to spend.
    const attachments = await readAttachments(files);

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
          attachments,
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
      // Names only for the audience whose membership the sender chose. Every
      // other one is a population its role already describes, and copying forty
      // names onto a row that says "EMPLOYEES, 40" would be storing the answer
      // twice. Captured at send time, so a later rename or deletion cannot
      // rewrite who was told something.
      recipientNames:
        input.audience === EmailAudience.SELECTED_ADMINS
          ? recipients.map((recipient) => recipient.name)
          : [],
    });

    return {
      audience: input.audience,
      recipientCount: recipients.length,
      deliveredCount,
      status,
      message: describeOutcome(status, deliveredCount, recipients.length, {
        individualName: individual?.name,
        hadAttachments: attachments.length > 0,
      }),
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
   * Erases the whole sent-message log.
   *
   * **The super admin's alone, and not delegable** — deliberately unlike sending,
   * which is. An administrator who could clear the log could send to the whole
   * organisation and then remove the only record that they had, which is the one
   * thing the trail exists to prevent. `canSendEmails` therefore buys no part of
   * this: the right to write to people is not the right to erase what was
   * written.
   *
   * It clears everything rather than the caller's own rows, because for the only
   * account that may call it those are the same thing, and a "mine only" variant
   * is exactly the shape that would let a sender edit themselves out.
   *
   * Nothing about delivered mail changes. The messages have been read; this
   * discards the administrative record of having sent them, which is why it is
   * gated harder than the sending was.
   */
  async clearHistory(actor: EmailActor): Promise<{ removed: number }> {
    if (!isSuperAdminRole(actor.role)) {
      throw new ForbiddenError("Only the super administrator can clear the sent message log.");
    }

    return { removed: await emailDispatchRepository.deleteAll() };
  },

  /**
   * Grants or withdraws the right for one administrator.
   *
   * Guarded by `requireSuperAdmin` in the route, the same as the other two
   * grants — an administrator cannot reach this, so there is no path by which
   * one could widen their own permissions or hand the right to a colleague.
   */
  async setPermission(adminId: string, allowed: boolean) {
    await assertGrantable(adminId);

    return employeeRepository.setEmailPermission(adminId, allowed);
  },

  /**
   * Grants or withdraws the right to write to the other administrators.
   *
   * Its own setter rather than a second argument on the one above, so the route
   * applies exactly the switch that moved — the same reason each grant has its
   * own branch in `/api/admin/administrators/[id]`. Reached only through
   * `requireSuperAdmin`, so no administrator can hand it to themselves or to a
   * colleague.
   */
  async setAdminEmailPermission(adminId: string, allowed: boolean) {
    await assertGrantable(adminId);

    return employeeRepository.setEmailAdminsPermission(adminId, allowed);
  },
};

/**
 * Refuses to hang an email grant on an account it would mean nothing on.
 *
 * The flags are only ever read for `ADMIN` — the super admin's rights are their
 * role, and an employee's are nothing — so setting one anywhere else would write
 * a value no code path consults and leave the Access panel implying a right that
 * does not exist.
 */
async function assertGrantable(adminId: string): Promise<void> {
  const employee = await employeeRepository.findById(adminId);
  if (!employee) throw new NotFoundError("That account no longer exists.");

  if (employee.role !== Role.ADMIN) {
    throw new ForbiddenError("Email permissions apply to administrators only.");
  }
}

function describeOutcome(
  status: EmailDispatchStatus,
  delivered: number,
  total: number,
  context: { individualName?: string; hadAttachments: boolean },
): string {
  const who = context.individualName ?? `${total} ${total === 1 ? "person" : "people"}`;

  if (status === EmailDispatchStatus.SENT) return `Sent to ${who}.`;
  if (status === EmailDispatchStatus.FAILED) {
    // A message the host refused wholesale, when it carried files, is far more
    // often an attachment the host would not take than a broken configuration —
    // so the sender is pointed at the thing they can actually change.
    return context.hadAttachments
      ? `Couldn't deliver that message to ${who}. Nothing was sent — the mail server may have refused an attachment. Try sending it without the files, or with smaller ones.`
      : `Couldn't deliver that message to ${who}. Nothing was sent — check the mail settings and try again.`;
  }

  return `Sent to ${delivered} of ${total}. ${total - delivered} ${total - delivered === 1 ? "address" : "addresses"} could not be reached.`;
}
