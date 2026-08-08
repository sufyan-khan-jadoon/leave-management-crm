/**
 * Asking the device where it is, with every way that can fail named.
 *
 * Browser-only: `navigator.geolocation` does not exist on the server, and this
 * module is imported from client components alone. It reports failures rather
 * than throwing strings, so the screen can say something useful about each one —
 * "turn permission on" and "we couldn't get a fix" need different answers.
 *
 * It deliberately does not judge the reading. Distance and the geofence are the
 * server's business; this only fetches three numbers and hands them over.
 */
import { GEOLOCATION_TIMEOUT_MS } from "@/lib/constants";
import type { PositionReading } from "@/lib/geo";

export type GeolocationFailure =
  /** No geolocation API at all — an old browser, or a non-secure origin. */
  | "unsupported"
  /** The user, or the browser's site settings, said no. */
  | "denied"
  /** The device tried and could not produce a fix. */
  | "unavailable"
  /** It took too long to answer. */
  | "timeout";

export type GeolocationOutcome =
  | { ok: true; reading: PositionReading }
  | { ok: false; failure: GeolocationFailure };

/**
 * Geolocation is gated on a secure context — HTTPS, or localhost for
 * development. On Vercel every deployment is HTTPS, so this only bites when the
 * app is opened over plain http on a LAN address while testing on a phone,
 * which is exactly when a clear message saves an hour.
 */
export function isGeolocationAvailable(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator && window.isSecureContext;
}

export function requestPosition(): Promise<GeolocationOutcome> {
  if (!isGeolocationAvailable()) {
    return Promise.resolve({ ok: false, failure: "unsupported" });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          ok: true,
          reading: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          },
        }),
      (error) => resolve({ ok: false, failure: describeError(error) }),
      {
        // The whole point is a fix good enough to place someone inside a 30m
        // circle, which the coarse network-based fix cannot do.
        enableHighAccuracy: true,
        timeout: GEOLOCATION_TIMEOUT_MS,
        // Never a cached fix: a position from an hour ago is a position from
        // wherever they were an hour ago.
        maximumAge: 0,
      },
    );
  });
}

function describeError(error: GeolocationPositionError): GeolocationFailure {
  if (error.code === error.PERMISSION_DENIED) return "denied";
  if (error.code === error.TIMEOUT) return "timeout";
  return "unavailable";
}

/** What to tell somebody about each way the device can refuse. */
export const GEOLOCATION_MESSAGES: Record<GeolocationFailure, string> = {
  unsupported: "This browser can't share your location. Try a different browser, or check the site is on HTTPS.",
  denied: "Location permission is required to mark attendance.",
  unavailable: "Your location is unavailable right now. Move somewhere with a clearer view of the sky and try again.",
  timeout: "Getting your location took too long. Please try again.",
};
