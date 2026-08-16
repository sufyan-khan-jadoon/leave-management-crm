/**
 * The short code a person quotes when they ring up about a complaint.
 *
 * A cuid is the complaint's real identity and stays so — this is derived from
 * it, never stored, so there is no second identifier to keep in step and no
 * counter to race. Deriving it also means it survives every export, email and
 * screen agreeing with each other for free.
 *
 * The last eight characters, uppercased, behind a `ZV-` prefix. The *last*
 * rather than the first because a cuid's leading characters encode its
 * timestamp and are near-identical for rows created in the same session — two
 * complaints filed a minute apart would otherwise read as the same reference at
 * a glance, which is the one thing a reference must not do. The tail is the
 * random half.
 *
 * It is deliberately **not** unique by construction, and nothing looks anybody
 * up by it: it is a human convenience for "which one are we talking about", and
 * every lookup in the system is still by id. Collisions are possible and
 * harmless. Don't turn this into a key.
 */
const PREFIX = "ZV";
const LENGTH = 8;

export function complaintReference(id: string): string {
  const tail = id.slice(-LENGTH).toUpperCase();

  return `${PREFIX}-${tail}`;
}
