/**
 * Consecutive leave days, gathered back into the stretch they were booked as.
 *
 * Leave is stored **one row per day** — `planLeave` splits the range somebody
 * asked for through `workingDaysService.split` and writes a row for each working
 * day inside it — and every figure in this codebase counts those rows. That is
 * the right storage and it is deliberately not changed here: this is a *reading*
 * of it, for the one screen that has to answer "when was this person off, and
 * for how long" rather than "how many days did they take".
 *
 * Two properties keep it from becoming a second opinion about anything:
 *
 * - **`days` is the number of rows in the spell**, never `to − from`. A Friday
 *   and the Monday after are two days off, not four, and the row count says so
 *   without this file having to know what a weekend is.
 * - **Nothing is invented.** The dates, the reason and the status are the rows'
 *   own; grouping changes how they are printed and nothing about what they say.
 *
 * Free of Prisma so it reads and tests alone, exactly as `working-days.ts` and
 * `remote-work.ts` do.
 */
import { addUtcDays, toIsoDate } from "@/lib/date";

/** One stored leave row, reduced to what grouping actually looks at. */
export type LeaveSpellDay = {
  date: Date;
  reason: string;
  status: string;
};

export type LeaveSpell = {
  /** First leave day in the run. */
  from: Date;
  /** Last leave day in the run — never a bridged day the run merely spanned. */
  to: Date;
  /** How many leave days it holds. The row count, so it cannot overstate. */
  days: number;
  reason: string;
  status: string;
};

/**
 * Groups leave days into the runs they were taken as.
 *
 * `bridged` is the set of ISO dates that do **not** break a run: weekly days off
 * and declared office closures, which is exactly the set `describeDay` reports
 * as `NON_WORKING` and `CLOSED`. Passing it in rather than deciding it here is
 * what keeps the working week and the holiday table the only authorities on
 * which days those are — this file would otherwise be the second place in the
 * codebase that believed it knew what a weekend was.
 *
 * Leave taken over a Friday and the Monday after therefore reads as one spell of
 * two days, which is how the person who booked it would describe it, while a
 * genuine gap — a working day back in the office — starts a new one. A changed
 * reason starts a new one too: two separate bookings that happen to abut are two
 * things that happened, not one.
 */
export function groupLeaveSpells(
  days: readonly LeaveSpellDay[],
  bridged: ReadonlySet<string>,
): LeaveSpell[] {
  const ordered = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
  const spells: LeaveSpell[] = [];

  for (const day of ordered) {
    const open = spells.at(-1);

    if (open && continues(open, day, bridged)) {
      open.to = day.date;
      open.days += 1;
      continue;
    }

    spells.push({ from: day.date, to: day.date, days: 1, reason: day.reason, status: day.status });
  }

  return spells;
}

/** Whether this day carries on the spell before it rather than starting one. */
function continues(spell: LeaveSpell, day: LeaveSpellDay, bridged: ReadonlySet<string>): boolean {
  if (spell.reason !== day.reason || spell.status !== day.status) return false;

  // Every date strictly between the two has to be one nobody was expected in
  // for. A single working day back at a desk ends the spell, however short.
  for (
    let between = addUtcDays(spell.to, 1);
    between.getTime() < day.date.getTime();
    between = addUtcDays(between, 1)
  ) {
    if (!bridged.has(toIsoDate(between))) return false;
  }

  return true;
}
