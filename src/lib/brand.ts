/**
 * The name and the palette an exported file carries.
 *
 * Deliberately literals rather than `appConfig.name`, for the reason
 * `services/email/templates.ts` gives about the letterhead: the app name is an
 * environment variable, and a stale `APP_NAME` in one deployment's dashboard
 * would put the wrong company on a spreadsheet somebody archives and mails
 * around — the same place as an email, where the mistake cannot be recovered
 * because the file has already left. The screens may be configurable; what a
 * document is signed with is not.
 *
 * It is the brand alone — no product name and no descriptor — so a file that
 * outlives this deployment still says who produced it. `BRAND_TAGLINE` is the
 * one line of explanation beneath it, and belongs in a footer rather than a
 * heading.
 *
 * Free of Prisma, of Next and of React, so both a route handler and a pure
 * formatter can read it.
 */

export const BRAND_NAME = "Zovencia";

/** What the brand is, in the footer of a printed page. */
export const BRAND_TAGLINE = "Attendance & Workforce Management";

/**
 * What the product name adds to the brand — "PRESENCE" out of "ZOVENCIA PRESENCE".
 *
 * For the one lockup where the **logo renders the brand word itself** and only
 * the remainder is set as text. Derived rather than hard-coded, so the sidebar
 * cannot end up printing "PRESENCE" beside the wordmark after somebody changes
 * `APP_NAME` to something else entirely.
 *
 * A name that does not start with the brand is returned whole: that is a
 * configuration nobody here anticipated, and showing all of it beside the logo
 * is the reading least likely to hide something.
 */
export function productSuffix(appName: string): string {
  const trimmed = appName.trim();

  return trimmed.toLowerCase().startsWith(BRAND_NAME.toLowerCase())
    ? trimmed.slice(BRAND_NAME.length).trim()
    : trimmed;
}

/**
 * The Zovencia palette, as a document renderer needs it.
 *
 * The same four colours the screens and the email templates are built from, and
 * the same FILL vs INK rule applies: `green` is extremely luminous (about 1.6:1
 * on white), so it is a **fill** and never a word on a light background.
 * `darkGreen` is what green text is written in, and what a header band is filled
 * with so the bright green can be used for the wordmark on top of it.
 */
export const BRAND_COLORS = {
  green: "#0AEA0A",
  darkGreen: "#023506",
  black: "#000000",
  white: "#FFFFFF",
  /** Neutral greys, pure (R=G=B) so nothing in a document drifts blue. */
  panel: "#F5F5F5",
  border: "#E5E5E5",
  muted: "#5A5A5A",
} as const;
