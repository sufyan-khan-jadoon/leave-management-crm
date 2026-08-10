import { describeOfficeHours } from "@/lib/attendance-policy";
import { MONTHLY_LEAVE_ALLOWANCE, quotaExceededMessage } from "@/lib/constants";
import { formatDate, formatDateRange, monthLabel, toIsoDate, toUtcDay, todayUtc } from "@/lib/date";
import { serverEnv } from "@/lib/env";
import { describeWeekdays, weeklyOffDays } from "@/lib/working-days";
import { holidayRepository } from "@/repositories/holiday.repository";
import { attendancePolicyService } from "@/services/attendance-policy.service";
import { interpretLeaveChat, type ChatTurn } from "@/services/ai.service";
import { leaveService } from "@/services/leave.service";

/**
 * A range the employee is being asked to confirm.
 *
 * Only the three inputs are carried, never the decision: confirming re-runs the
 * whole plan server-side, so an edited payload buys nothing.
 */
export type LeaveProposal = {
  startDate: string;
  days: number;
  reason: string;
  dates: string[];
  remainingAfter: number;
};

export type LeaveChatReply = {
  reply: string;
  proposal?: LeaveProposal;
};

function dayWord(count: number): string {
  return `${count} day${count === 1 ? "" : "s"}`;
}

/**
 * The office hours, in the company's own words rather than the model's.
 *
 * Every part of this is read here: the hours, which days the week actually runs,
 * and whether the office happens to be shut today. The assistant used to answer
 * this from nothing at all — "9:00 AM to 5:00 PM, Monday to Friday" — which was
 * wrong twice over, since the hours were invented and the week is configurable.
 *
 * Today's closure is mentioned because somebody asking when the office opens is
 * usually asking whether to come in, and the closure is the more useful half of
 * that answer. It deliberately does not go looking further ahead: this is a
 * question about the hours, not a calendar.
 */
async function describeHours(today: Date): Promise<string> {
  const [policy, closedToday] = await Promise.all([
    attendancePolicyService.get(),
    holidayRepository.closedDatesAmong([today]),
  ]);

  const hours = describeOfficeHours(policy.openingMinutes, policy.closingMinutes);
  const daysOff = weeklyOffDays(policy.workingDays);

  const week =
    daysOff.length === 0
      ? "The office works every day of the week."
      : `${describeWeekdays(daysOff)} ${daysOff.length === 1 ? "is a day" : "are days"} off.`;

  const closure = closedToday.length > 0 ? " The office is closed today." : "";

  return `The office is open ${hours}, Pakistan time. ${week}${closure}`;
}

export const leaveChatService = {
  /**
   * Answers one turn of the conversation.
   *
   * The model only classifies and extracts. Every number the employee sees —
   * balance, dates, what fits — is read from the database here, so the assistant
   * cannot invent an allowance or promise a day that is already taken.
   */
  async respond(employeeId: string, turns: ChatTurn[]): Promise<LeaveChatReply> {
    const today = todayUtc();
    const intent = await interpretLeaveChat(turns, today);

    if (intent.intent === "balance") {
      const balance = await leaveService.balanceFor(employeeId);

      return {
        reply:
          balance.remaining > 0
            ? `You have ${dayWord(balance.remaining)} left of your ${balance.allowance} for ${monthLabel(today)}. You've used ${balance.approvedThisMonth}.`
            : `You've used all ${balance.allowance} of your leaves for ${monthLabel(today)}. Your allowance resets next month.`,
      };
    }

    if (intent.intent === "hours") {
      return { reply: await describeHours(today) };
    }

    if (intent.intent === "history") {
      const { items } = await leaveService.list({
        employeeId,
        page: 1,
        pageSize: 5,
        sortBy: "leaveDate",
        sortDir: "desc",
      });

      if (items.length === 0) {
        return { reply: "You haven't booked any leave yet." };
      }

      const lines = items
        .map((leave) => `• ${formatDate(leave.leaveDate)} — ${leave.reason} (${leave.status.toLowerCase()})`)
        .join("\n");

      return { reply: `Here are your most recent requests:\n${lines}` };
    }

    if (intent.intent !== "book") {
      return { reply: intent.reply };
    }

    const env = serverEnv();
    const quotaMessage = quotaExceededMessage(env.HR_CONTACT_PHONE, env.HR_CONTACT_NAME);

    // There is deliberately no early "more days than the allowance" shortcut here
    // any more. It was sound while a request cost one day of allowance per
    // calendar day, and became wrong the moment only working days were charged:
    // six calendar days from a Thursday is three working days over a Sat/Sun
    // weekend, and refusing it against a four-day allowance would turn down a
    // request that fits. Nothing short of the real schedule can tell — a closure
    // can take the cost down to zero — so the judgement waits for `planLeave`,
    // which answers with the same quota wording below.
    if (!intent.startDate || !intent.days) {
      return { reply: intent.reply };
    }

    const startDate = toUtcDay(intent.startDate);

    // Checked before the reason is collected, for the same reason: a request
    // that cannot be booked should be refused while the employee is still
    // describing it. The reason plays no part in whether it fits.
    const plan = await leaveService.planLeave(employeeId, startDate, intent.days, intent.reason ?? "");

    if (!plan.ok) {
      const overAllowance = plan.months?.some((month) => month.used + month.requested > month.allowance);

      return {
        reply: overAllowance
          ? `${plan.problem} ${quotaMessage}`
          : `${plan.problem} Tell me a different date or a shorter stretch and I'll check again.`,
      };
    }

    // Only now is the reason worth asking for.
    if (!intent.reason) {
      return { reply: intent.reply };
    }

    // Said out loud rather than quietly shortening the range: somebody asking
    // for five days and being booked three would otherwise reasonably think the
    // assistant had miscounted. Both reasons a day drops out are named, because
    // "it's a weekend" and "the office is shut that day" are different facts and
    // only one of them is news.
    const notes = [
      plan.weeklyOffDates?.length
        ? `${formatDateRange(plan.weeklyOffDates)} ${plan.weeklyOffDates.length === 1 ? "is not a working day" : "are not working days"}`
        : null,
      plan.closedDates?.length
        ? `the office is closed ${formatDateRange(plan.closedDates)}`
        : null,
    ].filter(Boolean);

    const skippedNote = notes.length > 0 ? ` That skips ${notes.join(", and ")}, so you are not charged for them.` : "";

    return {
      reply: `Just to confirm — ${dayWord(plan.dates.length)} off, ${formatDateRange(plan.dates)}, for ${plan.reason}.${skippedNote} That would leave you ${dayWord(plan.remainingAfter ?? 0)} this month. Shall I book it?`,
      proposal: {
        startDate: toIsoDate(startDate),
        days: intent.days,
        reason: plan.reason,
        dates: plan.dates.map(toIsoDate),
        remainingAfter: plan.remainingAfter ?? 0,
      },
    };
  },

  /** Commits a proposal the employee confirmed. */
  async confirm(employeeId: string, proposal: LeaveProposal): Promise<LeaveChatReply> {
    const booking = await leaveService.bookLeave(
      employeeId,
      toUtcDay(proposal.startDate),
      proposal.days,
      proposal.reason,
    );

    const remaining =
      booking.remainingAfter > 0
        ? `You have ${dayWord(booking.remainingAfter)} left of your ${MONTHLY_LEAVE_ALLOWANCE} this month.`
        : `That uses your full ${MONTHLY_LEAVE_ALLOWANCE}-day allowance for this month.`;

    return {
      reply: `Done — ${dayWord(booking.dates.length)} approved for ${formatDateRange(booking.dates)}. ${remaining} A confirmation email is on its way.`,
    };
  },
};
