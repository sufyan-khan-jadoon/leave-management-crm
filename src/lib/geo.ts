/**
 * Whether a device's reported position puts somebody at the office.
 *
 * Kept free of Prisma, of the request, and of the session so the rule can be
 * read — and tested — on its own, the same way `holiday-notice.ts` is.
 * `attendance.service.ts` decides what to do with the answer.
 *
 * This is the *only* place the decision is made. The browser sends three
 * numbers and nothing else; it is never asked, and never believed, about
 * whether it is inside the fence.
 */
import { ALLOWED_RADIUS_METERS, MAX_ACCURACY_METERS, OFFICE_LOCATION } from "@/lib/constants";

export type Coordinates = { latitude: number; longitude: number };

/** A position as the browser reports one: where, and how sure it is. */
export type PositionReading = Coordinates & { accuracyMeters: number };

export type GeofenceVerdict =
  /** Inside the fence, on a reading good enough to say so. */
  | { allowed: true; distanceMeters: number }
  /** A real fix, and it is somewhere else. */
  | { allowed: false; reason: "outside"; distanceMeters: number }
  /** The fix is too vague to place them either way. Ask again, don't guess. */
  | { allowed: false; reason: "inaccurate"; distanceMeters: number };

/**
 * Mean Earth radius (IUGG). Haversine assumes a sphere, which is wrong by up to
 * ~0.5% over long distances — at the tens of metres this rule works in, that is
 * far below the GPS uncertainty the reading already carries.
 */
const EARTH_RADIUS_METERS = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Great-circle distance between two points, in metres.
 *
 * Haversine rather than the flat-earth shortcut: the shortcut needs a
 * latitude-dependent correction to the longitude term, and getting that wrong is
 * invisible at the equator and badly wrong at 34°N, which is where this office
 * happens to be.
 */
export function distanceInMeters(from: Coordinates, to: Coordinates): number {
  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** How far a reading is from the office. */
export function distanceFromOffice(position: Coordinates): number {
  return distanceInMeters(position, OFFICE_LOCATION);
}

/**
 * The whole rule: at the office, or not.
 *
 * Accuracy is checked first and separately. A vague reading is refused outright
 * rather than resolved generously — including when it happens to land inside the
 * circle, which is the case that matters, since that is the one where believing
 * it would mark somebody present who is not there. The reverse case costs
 * nothing: a vague reading well outside the fence would have been refused
 * anyway, so reporting it as "try again" rather than "you are elsewhere" tells
 * the truth about what the server actually knows.
 */
export function judgePosition(reading: PositionReading): GeofenceVerdict {
  const distanceMeters = distanceFromOffice(reading);

  if (!isUsableAccuracy(reading.accuracyMeters)) {
    return { allowed: false, reason: "inaccurate", distanceMeters };
  }

  return distanceMeters <= ALLOWED_RADIUS_METERS
    ? { allowed: true, distanceMeters }
    : { allowed: false, reason: "outside", distanceMeters };
}

/**
 * A device claiming perfect certainty is claiming something GPS cannot deliver,
 * so zero and negatives are rejected alongside the merely vague — those are a
 * broken or spoofed reading rather than an excellent one.
 */
export function isUsableAccuracy(accuracyMeters: number): boolean {
  return Number.isFinite(accuracyMeters) && accuracyMeters > 0 && accuracyMeters <= MAX_ACCURACY_METERS;
}

/** Metres, rounded the way every screen shows them. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
