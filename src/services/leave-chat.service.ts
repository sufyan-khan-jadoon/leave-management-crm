import { MONTHLY_LEAVE_ALLOWANCE } from "@/lib/constants";
import { formatDate, formatDateRange, monthLabel, toIsoDate, toUtcDay, todayUtc } from "@/lib/date";
import { serverEnv } from "@/lib/env";
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

    // Anything still unknown is asked for by the model, which phrased the
    // question with the conversation in view.
    if (!intent.startDate || !intent.days || !intent.reason) {
      return { reply: intent.reply };
    }

    const startDate = toUtcDay(intent.startDate);
    const plan = await leaveService.planLeave(employeeId, startDate, intent.days, intent.reason);

    if (!plan.ok) {
      // `problem` already states the shortfall, so the stock quota sentence
      // would only repeat it — point at HR instead.
      const exhausted = plan.months?.some((month) => month.used >= month.allowance);

      return {
        reply: exhausted
          ? `${plan.problem} Please contact HR at ${serverEnv().HR_CONTACT_PHONE} if you need more.`
          : `${plan.problem} Tell me a different date or a shorter stretch and I'll check again.`,
      };
    }

    return {
      reply: `Just to confirm — ${dayWord(plan.dates.length)} off, ${formatDateRange(plan.dates)}, for ${plan.reason}. That would leave you ${dayWord(plan.remainingAfter ?? 0)} this month. Shall I book it?`,
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
