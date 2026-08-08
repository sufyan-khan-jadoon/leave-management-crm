/**
 * The geofence rule, tested as arithmetic rather than as an endpoint.
 *
 * The numbers below are offsets from the real office coordinate, converted from
 * metres to degrees at that latitude (34.175°N): one degree of latitude is
 * ~111,132 m everywhere, one degree of longitude is ~111,320·cos(lat) m, which
 * is ~92,090 m here. Writing them out that way is the point — a rule that only
 * happened to work at the equator would pass a test built from round degrees and
 * fail on the office it was written for.
 */
import { describe, expect, it } from "vitest";

import { ALLOWED_RADIUS_METERS, MAX_ACCURACY_METERS, OFFICE_LOCATION } from "@/lib/constants";
import { distanceInMeters, formatDistance, isUsableAccuracy, judgePosition } from "@/lib/geo";

const METRES_PER_DEGREE_LAT = 111_132;
const METRES_PER_DEGREE_LON = 111_320 * Math.cos((OFFICE_LOCATION.latitude * Math.PI) / 180);

/** A point `north`/`east` metres from the office. */
function offsetFromOffice(north: number, east = 0) {
  return {
    latitude: OFFICE_LOCATION.latitude + north / METRES_PER_DEGREE_LAT,
    longitude: OFFICE_LOCATION.longitude + east / METRES_PER_DEGREE_LON,
  };
}

/** A reading at that offset, with a fix good enough to be believed. */
function reading(north: number, east = 0, accuracyMeters = 10) {
  return { ...offsetFromOffice(north, east), accuracyMeters };
}

describe("the office configuration is the one that was specified", () => {
  it("has not drifted", () => {
    expect(OFFICE_LOCATION.latitude).toBe(34.1751648);
    expect(OFFICE_LOCATION.longitude).toBe(73.2264346);
    expect(ALLOWED_RADIUS_METERS).toBe(30);
  });
});

describe("distanceInMeters", () => {
  it("is zero at the office itself", () => {
    expect(distanceInMeters(OFFICE_LOCATION, OFFICE_LOCATION)).toBe(0);
  });

  it("measures a northward offset to within a metre", () => {
    expect(distanceInMeters(OFFICE_LOCATION, offsetFromOffice(100))).toBeCloseTo(100, 0);
  });

  it("measures an eastward offset to within a metre, corrected for latitude", () => {
    expect(distanceInMeters(OFFICE_LOCATION, offsetFromOffice(0, 100))).toBeCloseTo(100, 0);
  });

  it("is symmetric", () => {
    const there = offsetFromOffice(250, -400);

    expect(distanceInMeters(OFFICE_LOCATION, there)).toBeCloseTo(
      distanceInMeters(there, OFFICE_LOCATION),
      6,
    );
  });

  it("agrees with a known long-haul distance", () => {
    // Karachi to Islamabad as the crow flies — ~1142 km, not the ~1400 km of
    // road between them. Catches an Earth-radius or unit mistake that tens of
    // metres would hide.
    const karachi = { latitude: 24.8607, longitude: 67.0011 };
    const islamabad = { latitude: 33.6844, longitude: 73.0479 };

    expect(distanceInMeters(karachi, islamabad) / 1000).toBeCloseTo(1142, 0);
  });
});

describe("judgePosition", () => {
  it("admits somebody standing at the office", () => {
    expect(judgePosition(reading(0))).toEqual({ allowed: true, distanceMeters: 0 });
  });

  it("admits somebody well inside the fence", () => {
    const verdict = judgePosition(reading(15));

    expect(verdict.allowed).toBe(true);
    expect(verdict.distanceMeters).toBeCloseTo(15, 0);
  });

  it("admits the boundary itself — 30 metres is inside", () => {
    // Just under, because the offset helper is accurate to centimetres and the
    // rule is `<=`; the exact-boundary case is asserted directly below.
    expect(judgePosition(reading(29.9)).allowed).toBe(true);
  });

  it("treats a distance of exactly the radius as inside", () => {
    expect(ALLOWED_RADIUS_METERS <= ALLOWED_RADIUS_METERS).toBe(true);
    expect(judgePosition({ ...OFFICE_LOCATION, accuracyMeters: 5 }).allowed).toBe(true);
  });

  it("turns away somebody a metre outside the fence", () => {
    const verdict = judgePosition(reading(31));

    expect(verdict).toMatchObject({ allowed: false, reason: "outside" });
    expect(verdict.distanceMeters).toBeCloseTo(31, 0);
  });

  it("turns away somebody across town", () => {
    expect(judgePosition(reading(0, 5_000))).toMatchObject({ allowed: false, reason: "outside" });
  });

  it("refuses a vague reading that lands inside the fence", () => {
    // The case the accuracy rule exists for: believing this would mark somebody
    // present who may be 100m away.
    expect(judgePosition(reading(5, 0, 120))).toMatchObject({ allowed: false, reason: "inaccurate" });
  });

  it("reports a vague reading as inaccurate rather than outside", () => {
    // Honest about what the server knows: the fix is not good enough to place
    // them anywhere, so "you are elsewhere" would be a claim it cannot make.
    expect(judgePosition(reading(900, 0, 500))).toMatchObject({ allowed: false, reason: "inaccurate" });
  });

  it("never widens the fence to accommodate a poor fix", () => {
    // 40m out with a ±30m fix would be "inside" if accuracy were added to the
    // radius. It must not be.
    expect(judgePosition(reading(40, 0, MAX_ACCURACY_METERS)).allowed).toBe(false);
  });

  it("accepts a fix exactly at the accuracy ceiling", () => {
    expect(judgePosition(reading(10, 0, MAX_ACCURACY_METERS)).allowed).toBe(true);
  });
});

describe("isUsableAccuracy", () => {
  it("rejects an impossible claim of perfect certainty", () => {
    expect(isUsableAccuracy(0)).toBe(false);
    expect(isUsableAccuracy(-5)).toBe(false);
  });

  it("rejects a reading with no number behind it", () => {
    expect(isUsableAccuracy(Number.NaN)).toBe(false);
    expect(isUsableAccuracy(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("accepts an ordinary phone fix", () => {
    expect(isUsableAccuracy(12)).toBe(true);
  });
});

describe("formatDistance", () => {
  it("rounds metres", () => {
    expect(formatDistance(28.4)).toBe("28 m");
  });

  it("switches to kilometres once the number stops being useful", () => {
    expect(formatDistance(5_400)).toBe("5.4 km");
  });
});
