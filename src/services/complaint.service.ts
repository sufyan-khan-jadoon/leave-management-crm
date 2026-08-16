import { Role, type ComplaintStatus } from "@prisma/client";

import {
  isValidTransition,
  requiresResolution,
  shouldNotifyResolution,
  type ComplaintStatusValue,
} from "@/lib/complaint-status";
import { complaintReference } from "@/lib/complaint-reference";
import { isSuperAdminRole } from "@/lib/enums";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";
import {
  complaintRepository,
  type ComplaintCounts,
  type ComplaintDto,
  type EmployeeComplaintDto,
} from "@/repositories/complaint.repository";
import { employeeRepository } from "@/repositories/employee.repository";
import { emailService } from "@/services/email/email.service";
import type {
  ComplaintQuery,
  MyComplaintQuery,
  SubmitComplaintInput,
  UpdateComplaintInput,
} from "@/validations/complaint.schema";

/** Who is asking. The same shape the holiday, invitation and email rules take. */
export type ComplaintActor = { id: string; role: Role };

/** What one status change amounted to, as the screen reports it back. */
export type UpdateResult = {
  complaint: ComplaintDto;
  /**
   * What happened to the resolution email, in the one act that can send it.
   *
   * `null` when this change was never a candidate — most updates are not.
   * `already-sent` when the letter went out for an earlier resolution and the
   * claim refused a second, which is the reopen-and-resolve-again case.
   */
  notification: "sent" | "failed" | "already-sent" | null;
};

/**
 * Whether this account may read and act on complaints that are not their own.
 *
 * The super admin always may. An administrator only once granted it, and the
 * grant is read from the database on **every** call rather than from the
 * session — the same rule `canManageHolidays` and `canSendEmails` follow, and
 * for the same reason: withdrawing it has to stop the next request rather than
 * wait for a week-old token to expire. Employees never may, whatever the column
 * says, because the column is only ever set on administrators.
 */
async function mayManage(actor: ComplaintActor): Promise<boolean> {
  if (isSuperAdminRole(actor.role)) return true;
  if (actor.role !== Role.ADMIN) return false;

  const employee = await employeeRepository.findById(actor.id);
  return Boolean(employee?.canManageComplaints);
}

async function assertMayManage(actor: ComplaintActor): Promise<void> {
  if (await mayManage(actor)) return;

  throw new ForbiddenError(
    actor.role === Role.ADMIN
      ? "You do not have permission to view employee complaints. Ask your super administrator to enable it."
      : "Only administrators can manage complaints.",
  );
}

/**
 * Turns a submitted data URL into the columns the row wants.
 *
 * The content type is read back off the payload the schema already validated
 * rather than taken as a separate field, so the two can never disagree — the
 * same argument `email-attachments.ts` makes for deriving the type from the
 * extension instead of believing `file.type`. The size is `data.length`, the
 * encoded string that actually lands in the column, never a number the browser
 * offered.
 */
function describeAttachment(file: { filename: string; data: string }) {
  const contentType = file.data.slice(5, file.data.indexOf(";"));

  return {
    filename: file.filename,
    contentType,
    size: file.data.length,
    data: file.data,
  };
}

export const complaintService = {
  mayManage,

  /**
   * Grants or withdraws the right for one administrator.
   *
   * Reached only through `requireSuperAdmin` in the route, the same as the other
   * six grants, so no administrator can hand it to themselves or a colleague.
   * Refused on anything that is not an `ADMIN` for the reason the email grants
   * are: the column is read for that role alone, so setting it elsewhere would
   * write a value nothing consults while the Access panel implied a right that
   * does not exist.
   */
  async setPermission(adminId: string, allowed: boolean) {
    const employee = await employeeRepository.findById(adminId);
    if (!employee) throw new NotFoundError("That account no longer exists.");

    if (employee.role !== Role.ADMIN) {
      throw new ForbiddenError("Complaint permissions apply to administrators only.");
    }

    return employeeRepository.setComplaintPermission(adminId, allowed);
  },

  /**
   * Files a complaint, always in the name of whoever is signed in.
   *
   * `employeeId` is the **only** thing that decides authorship and it comes from
   * the session — `submitComplaintSchema` is a `strictObject` with no field for
   * it, so a body offering one is refused rather than ignored. Status is the
   * column default, which is why there is no way to file something already
   * resolved.
   *
   * Open to administrators as well as employees, deliberately. An admin is an
   * `Employee` with a different role and has the same workplace problems, and
   * the alternative is telling the one group most likely to be affected by a
   * senior colleague that they have nowhere to report it. It is the same
   * reasoning that keeps leave open to them.
   */
  async submit(actor: ComplaintActor, input: SubmitComplaintInput): Promise<ComplaintDto> {
    // Proves the session points at a real account before writing a row that
    // would otherwise fail on the foreign key with nothing useful to say.
    const author = await employeeRepository.findById(actor.id);
    if (!author) throw new NotFoundError("Your account no longer exists.");

    return complaintRepository.create({
      employeeId: actor.id,
      subject: input.subject,
      description: input.description,
      attachments: input.attachments.map(describeAttachment),
    });
  },

  /**
   * The signed-in person's own complaints.
   *
   * Scoped to the session id with **no way to widen it**, deliberately unlike
   * the admin list and deliberately like `/api/attendance`: there is no
   * `employeeId` parameter to leave off, so no request shape exists that returns
   * somebody else's. `employeeComplaintSelect` is what comes back, so internal
   * notes are not merely filtered out — they were never read.
   */
  async listMine(
    actor: ComplaintActor,
    query: MyComplaintQuery,
  ): Promise<{ items: EmployeeComplaintDto[]; total: number }> {
    return complaintRepository.listOwnedBy(actor.id, {
      status: query.status as ComplaintStatus | undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
  },

  /**
   * One of the signed-in person's own complaints.
   *
   * Ownership is the query, not a check after the fact — see `findOwnedBy`. A
   * complaint belonging to somebody else is reported as **not found** rather
   * than forbidden, the wording `assertMayManage` uses on reads elsewhere, so
   * the endpoint cannot be used to discover which ids exist.
   */
  async findMine(actor: ComplaintActor, id: string): Promise<EmployeeComplaintDto> {
    const complaint = await complaintRepository.findOwnedBy(id, actor.id);
    if (!complaint) throw new NotFoundError("That complaint could not be found.");

    return complaint;
  },

  /** Every complaint, for whoever holds the grant. */
  async list(
    actor: ComplaintActor,
    query: ComplaintQuery,
  ): Promise<{ items: ComplaintDto[]; total: number; counts: ComplaintCounts }> {
    await assertMayManage(actor);

    const [{ items, total }, counts] = await Promise.all([
      complaintRepository.listForAdmin({
        search: query.search,
        status: query.status as ComplaintStatus | undefined,
        employeeId: query.employeeId,
        from: query.from ? new Date(`${query.from}T00:00:00.000Z`) : undefined,
        // Through the end of the named day, not its first instant — a range of
        // one day that matched nothing filed after midnight would be a filter
        // that quietly hides the thing somebody is looking for.
        to: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined,
        sort: query.sort,
        page: query.page,
        pageSize: query.pageSize,
      }),
      complaintRepository.counts(),
    ]);

    return { items, total, counts };
  },

  async find(actor: ComplaintActor, id: string): Promise<ComplaintDto> {
    await assertMayManage(actor);

    const complaint = await complaintRepository.findById(id);
    if (!complaint) throw new NotFoundError("That complaint could not be found.");

    return complaint;
  },

  /**
   * One attachment's bytes, for whoever is entitled to the complaint it hangs on.
   *
   * The permission is re-derived from the *complaint*, never from the attachment
   * id — an id is a bearer token otherwise, and these are files somebody
   * uploaded as evidence in a grievance. An employee gets their own; a manager
   * gets any. Everything else is not found.
   */
  async attachment(actor: ComplaintActor, attachmentId: string) {
    const attachment = await complaintRepository.findAttachment(attachmentId);
    if (!attachment) throw new NotFoundError("That attachment could not be found.");

    const owned = await complaintRepository.findOwnedBy(attachment.complaintId, actor.id);
    if (owned) return attachment;

    if (await mayManage(actor)) return attachment;

    throw new NotFoundError("That attachment could not be found.");
  },

  /**
   * Changes a complaint's status, resolution or notes — and mails the employee
   * the first time it reaches RESOLVED.
   *
   * Three things are decided here and each is worth stating.
   *
   * **The actor writes their own name.** `resolvedById` is `actor.id`, taken
   * from the session; `updateComplaintSchema` has no field for it, so nobody can
   * credit a colleague with their decision or file one anonymously.
   *
   * **A closing status must carry words.** Checked against the resolution that
   * would be *stored after this change* rather than against what was sent, so
   * re-closing a complaint that already carries one is fine and closing a fresh
   * one with nothing said is refused. The schema cannot make that distinction —
   * it never sees the row.
   *
   * **The email is claimed before it is composed.** `claimResolutionNotice` is a
   * conditional update that exactly one caller can win, so a double-submitted
   * request, a refreshed page, two administrators resolving at once, or the
   * whole resolve → reopen → resolve cycle produce one letter between them. The
   * claim is never cleared, which is what makes the last of those work.
   */
  async update(
    actor: ComplaintActor,
    id: string,
    input: UpdateComplaintInput,
  ): Promise<UpdateResult> {
    await assertMayManage(actor);

    const existing = await complaintRepository.findById(id);
    if (!existing) throw new NotFoundError("That complaint could not be found.");

    const from = existing.status as ComplaintStatusValue;
    const to = (input.status ?? existing.status) as ComplaintStatusValue;

    // A no-op status is refused rather than quietly applied, so a second press
    // of the button cannot rewrite `resolvedAt` or re-credit the decision. The
    // once-only email does not depend on this — the claim does — but this is
    // what keeps the audit fields honest.
    if (input.status && !isValidTransition(from, to)) {
      throw new ConflictError(`This complaint is already marked ${from.toLowerCase().replace("_", " ")}.`);
    }

    const resolution = input.resolution !== undefined ? input.resolution : existing.resolution;

    if (requiresResolution(to) && !resolution?.trim()) {
      throw new ValidationError("Say what was decided before closing this complaint.", {
        resolution: "Add the resolution details the employee will see.",
      });
    }

    const closing = requiresResolution(to);
    const notify = shouldNotifyResolution(from, to);

    const updated = await complaintRepository.update(id, {
      ...(input.status ? { status: input.status as ComplaintStatus } : {}),
      ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
      // Stamped only when this change is what closed it. Reopening deliberately
      // leaves the previous resolver and moment in place rather than nulling
      // them: the record that somebody closed it once is still true.
      ...(closing && !requiresResolution(from)
        ? { resolvedAt: new Date(), resolvedBy: { connect: { id: actor.id } } }
        : {}),
    });

    if (!notify) return { complaint: updated, notification: null };

    const notification = await sendResolutionNotice(updated, resolution!);

    // Re-read, because `updated` was fetched *before* the notice fields were
    // written and would report `resolutionNoticeClaimedAt: null` on the very
    // request that claimed it. The admin screen reads exactly those two columns
    // to show whether the letter arrived, so returning the pre-send row would
    // have it announce "email failed" for a message that had just gone out —
    // self-correcting on the next reload, which is the worst kind of wrong.
    // One extra query, only ever on the resolve path.
    return { complaint: (await complaintRepository.findById(id)) ?? updated, notification };
  },
};

/**
 * Mails the employee, at most once for the life of the complaint.
 *
 * The claim comes first and the address is looked up second, in that order, so
 * a failure to read the account cannot burn a claim on a letter that was never
 * attempted — and so nothing at all is composed for a complaint that has already
 * had its letter.
 *
 * **The recipient is the complaint's own author, read from the database.** Not a
 * field on the request, not the actor, not anything an administrator typed. That
 * is the one rule this function exists to make unavoidable: resolving somebody's
 * grievance must not be a way to redirect the answer to it.
 *
 * A failure is reported back rather than thrown. The complaint *is* resolved —
 * that write has already happened and is correct — so throwing would report a
 * successful resolution as an error and invite somebody to press the button
 * again. It is deliberately not retried, for the reason `AttendanceWarning`
 * gives: a retry that cannot tell "never sent" from "sent, then the write
 * failed" is how somebody gets the same letter twice.
 */
async function sendResolutionNotice(
  complaint: ComplaintDto,
  resolution: string,
): Promise<"sent" | "failed" | "already-sent"> {
  if (!(await complaintRepository.claimResolutionNotice(complaint.id))) return "already-sent";

  const delivered = await emailService.sendComplaintResolved(complaint.employee.email, {
    name: complaint.employee.name,
    reference: complaintReference(complaint.id),
    subject: complaint.subject,
    resolution,
    resolvedAt: complaint.resolvedAt ?? new Date(),
    resolvedByName: complaint.resolvedBy?.name ?? null,
  });

  if (!delivered) return "failed";

  await complaintRepository.markResolutionNoticeSent(complaint.id);

  return "sent";
}
