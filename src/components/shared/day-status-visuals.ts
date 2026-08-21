import type { AttendanceDayStatus } from "@/types";

/**
 * A day's verdict as a colour, for the two surfaces that have to show eight of
 * them side by side: the report calendar and the charts beside it.
 *
 * **Why this exists rather than reusing the badge's variant.** `Badge` has four
 * tiers — success, destructive, warning, secondary — and five of the eight
 * statuses share the last one. That is right for a badge, where the word does
 * the work and the colour is a hint; it is useless in a calendar cell, where the
 * colour *is* the word and "office closed", "non-working", "no record" and "not
 * yet" have to be told apart at a glance.
 *
 * So this is a **finer** encoding, not a competing one. Where the badge commits
 * to a colour this agrees with it: present is the brand green, absent is the
 * destructive red, leave is the amber the report's own tiles and record chips
 * already give it. Where the badge deliberately merges — the five greys, and
 * remote sharing amber with leave — this separates them, and only there. The
 * wording stays `dayStatusLabel`'s in both, so nothing can be *named* two ways.
 *
 * Remote takes `--brand-deep`, the palette's other green. It is a day somebody
 * worked, which is what the second green reads as, and it carries no verdict —
 * the property the badge's note says amber was chosen for. It cannot be the
 * luminous brand green, which is what "present" means everywhere here.
 *
 * No colour is named as a literal: every one is a token from `globals.css`, per
 * the FILL vs INK rule. These are all fills, so none of them is an `-ink`.
 */
export type DayStatusVisual = {
  /** A chart fill or a calendar dot. Exact tokens, never darkened. */
  color: string;
  /** The calendar cell's own tint, at the weight that keeps the date legible. */
  cell: string;
};

export const DAY_STATUS_VISUAL: Record<AttendanceDayStatus, DayStatusVisual> = {
  PRESENT: {
    color: "var(--color-success)",
    cell: "bg-success/15 border-success/40",
  },
  ABSENT: {
    color: "var(--color-destructive)",
    cell: "bg-destructive/12 border-destructive/40",
  },
  ON_LEAVE: {
    color: "var(--color-warning)",
    cell: "bg-warning/18 border-warning/45",
  },
  REMOTE: {
    color: "var(--brand-deep)",
    cell: "bg-[var(--brand-deep)]/12 border-[var(--brand-deep)]/40",
  },
  /**
   * The four that are the *absence* of a record, as a ladder of one neutral.
   *
   * **They were one colour each and three of them were the same colour**, which
   * a calendar cell hid and nothing else did: the cells differ by border style,
   * so `NON_WORKING`, `NO_RECORD` and `UPCOMING` read apart there while their
   * legend dots were identical and their doughnut slices were a single
   * undifferentiated mass — 26 of 31 days, in the case that found it. A shape
   * with no border to vary needs the colour to carry the distinction.
   *
   * The ladder is **how much the system knows**, heaviest first: a declared
   * closure is a positive fact about the date, a weekly day off is standing
   * configuration, `NO_RECORD` is nothing known, and `UPCOMING` has not
   * happened. None of them is a verdict on anybody, so all four stay inside the
   * one muted hue rather than borrowing a status colour — fading, not competing.
   */
  CLOSED: {
    color: "var(--color-muted-foreground)",
    cell: "bg-muted border-border",
  },
  NON_WORKING: {
    color: "color-mix(in oklab, var(--color-muted-foreground) 62%, transparent)",
    cell: "bg-muted/50 border-border/60",
  },
  // Dashed and unfilled in the calendar, deliberately. Nothing is known about
  // the day, and a tint of any weight would look like a claim about it — the
  // same reason the badge refuses `destructive` here.
  NO_RECORD: {
    color: "color-mix(in oklab, var(--color-muted-foreground) 38%, transparent)",
    cell: "border-dashed border-border bg-transparent",
  },
  UPCOMING: {
    color: "color-mix(in oklab, var(--color-muted-foreground) 20%, transparent)",
    cell: "border-border/50 bg-transparent",
  },
};

/**
 * The order these read in, wherever they are listed together.
 *
 * Records first, in the order the report's own tiles and columns take them, then
 * the four that are the absence of a record. A legend that reordered itself by
 * count would make two months of the same person's attendance look like two
 * different charts.
 */
export const DAY_STATUS_ORDER: AttendanceDayStatus[] = [
  "PRESENT",
  "ABSENT",
  "ON_LEAVE",
  "REMOTE",
  "CLOSED",
  "NON_WORKING",
  "NO_RECORD",
  "UPCOMING",
];
