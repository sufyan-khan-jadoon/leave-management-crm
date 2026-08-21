/**
 * The branding every outgoing message carries, pinned.
 *
 * Templates are pure string builders — no database, no network, no environment —
 * so they fit the suite's rule exactly. What is checked here is not that the
 * markup looks nice, which no assertion can tell, but the handful of facts that
 * are expensive to get wrong: mail cannot be recalled, so a wrong colour or a
 * stale product name is permanent the moment it is sent.
 *
 * The palette test is the important one. The design this replaced went purple
 * through its *neutrals* — #f4f5fb, #8b90a8 — rather than through anything
 * declared as a brand colour, which is why a review of the obvious constants
 * missed it. Asserting that every non-brand colour is a true grey (R=G=B) is
 * what catches that class of drift rather than the specific hexes that caused it.
 */
import { describe, expect, it } from "vitest";

import {
  accountLockedTemplate,
  accountStatusTemplate,
  adminDecisionTemplate,
  attendanceWarningTemplate,
  complaintResolvedTemplate,
  emailVerifiedTemplate,
  invitationTemplate,
  leaveApprovedTemplate,
  officeClosedTemplate,
  otpTemplate,
  passwordChangedTemplate,
  passwordResetOtpTemplate,
  profileUpdatedTemplate,
  remoteWorkAssignedTemplate,
  remoteWorkRevokedTemplate,
  remoteWorkUpdatedTemplate,
  welcomeTemplate,
} from "@/services/email/templates";

const BRAND_GREEN = "#0AEA0A";
const DARK_GREEN = "#023506";

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/** Every template, built with representative data. */
const templates = {
  welcome: welcomeTemplate("Ayesha Khan"),
  invitationEmployee: invitationTemplate({
    role: "EMPLOYEE",
    jobTitle: "Software Engineer",
    inviterName: "Sufyan Khan",
    url: "https://example.test/register?token=abc",
    expiresAt: day("2026-08-20"),
  }),
  invitationAdmin: invitationTemplate({
    role: "ADMIN",
    jobTitle: null,
    inviterName: "Sufyan Khan",
    url: "https://example.test/admin/register?token=xyz",
    expiresAt: day("2026-08-20"),
  }),
  otp: otpTemplate("Ayesha Khan", "482913"),
  passwordResetOtp: passwordResetOtpTemplate("Ayesha Khan", "204857"),
  accountLocked: accountLockedTemplate("Ayesha Khan", "119357"),
  passwordChanged: passwordChangedTemplate("Ayesha Khan"),
  adminApproved: adminDecisionTemplate("Ayesha Khan", true),
  adminDeclined: adminDecisionTemplate("Ayesha Khan", false),
  emailVerified: emailVerifiedTemplate("Ayesha Khan"),
  leaveApproved: leaveApprovedTemplate("Ayesha Khan", [day("2026-08-17"), day("2026-08-18")], "Family wedding", 2),
  officeClosed: officeClosedTemplate({
    name: "System Administrator",
    weekday: "Friday",
    date: day("2026-08-14"),
    reason: "Race Condition Day",
    closesToday: false,
  }),
  officeClosedToday: officeClosedTemplate({
    name: "System Administrator",
    weekday: "Friday",
    date: day("2026-08-14"),
    reason: "Race Condition Day",
    closesToday: true,
  }),
  attendanceWarningFirst: attendanceWarningTemplate({
    name: "Ayesha Khan",
    date: day("2026-08-12"),
    cutoffLabel: "5:00 PM",
    consecutiveMissed: 1,
  }),
  attendanceWarningRepeat: attendanceWarningTemplate({
    name: "Ayesha Khan",
    date: day("2026-08-12"),
    cutoffLabel: "5:00 PM",
    consecutiveMissed: 3,
  }),
  profileUpdated: profileUpdatedTemplate("Ayesha Khan", "an administrator"),
  accountSuspended: accountStatusTemplate("Ayesha Khan", true),
  accountReactivated: accountStatusTemplate("Ayesha Khan", false),
  // All three remote-work letters, and both shapes of the first — a bounded
  // period and an open-ended one word themselves differently, so a suite that
  // built only one would leave the other inheriting none of the branding,
  // palette and letterhead invariants below.
  remoteWorkAssigned: remoteWorkAssignedTemplate({
    name: "Ayesha Khan",
    period: "Aug 21, 2026 – Aug 28, 2026",
    dayCount: 8,
    reason: "Working from home while the office is refitted",
    assignedByName: "System Administrator",
    permanent: false,
  }),
  remoteWorkAssignedPermanent: remoteWorkAssignedTemplate({
    name: "Ayesha Khan",
    period: "Aug 21, 2026 onwards, until revoked",
    dayCount: null,
    reason: "Permanently remote — Lahore",
    assignedByName: "System Administrator",
    permanent: true,
  }),
  remoteWorkUpdated: remoteWorkUpdatedTemplate({
    name: "Ayesha Khan",
    previousPeriod: "Aug 21, 2026 – Aug 28, 2026",
    period: "Aug 21, 2026 – Sep 15, 2026",
    reason: "Refit is running late",
    changedByName: "System Administrator",
    permanent: false,
  }),
  remoteWorkRevoked: remoteWorkRevokedTemplate({
    name: "Ayesha Khan",
    period: "Aug 21, 2026 – Aug 24, 2026",
    resumesOn: day("2026-08-25"),
    reason: "Office reopened early",
    revokedByName: "System Administrator",
  }),
  complaintResolved: complaintResolvedTemplate({
    name: "Ayesha Khan",
    reference: "ZV-8F3K2A9C",
    subject: "Air conditioning is broken",
    resolution: "Facilities replaced the compressor on Friday.\nIt has been running since.",
    resolvedAt: new Date("2026-08-16T09:30:00.000Z"),
    resolvedByName: "System Administrator",
  }),
};

const entries = Object.entries(templates);

describe.each(entries)("%s", (_name, template) => {
  it("carries both official logos in the letterhead", () => {
    // The header used to set the word Zovencia in bold; it now carries the two
    // supplied assets. Asserted by filename so a template cannot quietly go
    // back to typing the brand, and so the *black* wordmark is pinned — the
    // white one is unreadable on the green band and on a white panel alike.
    expect(template.html).toContain("/brand/email/zovencia-mark.png");
    expect(template.html).toContain("/brand/email/zovencia-full-black.png");
    expect(template.html).not.toContain("zovencia-full-white.png");
  });

  it("addresses those logos absolutely, since a recipient has no site to be relative to", () => {
    for (const src of template.html.match(/<img[^>]+src="([^"]+)"/g) ?? []) {
      expect(src).toMatch(/src="https?:\/\//);
    }
  });

  it("names the logos for a client that blocks images", () => {
    expect(template.html).toContain('alt="Zovencia logo"');
    expect(template.html).toContain('alt="Zovencia"');
  });

  it("still signs off as Zovencia in the footer", () => {
    expect(template.html).toMatch(/>Zovencia</);
  });

  it("carries the exact brand green", () => {
    expect(template.html).toContain(BRAND_GREEN);
  });

  it("names no product, tagline or predecessor", () => {
    const all = `${template.subject}\n${template.html}\n${template.text}`;

    // The comment block at the top of templates.ts mentions the old hexes by
    // name; comments never reach output, so this is checking rendered mail only.
    expect(all).not.toMatch(/Leave CRM/i);
    expect(all).not.toMatch(/Leave Management CRM/i);
    expect(all).not.toMatch(/Zovencia Presence/i);
    expect(all).not.toMatch(/Workforce Management/i);
    expect(all).not.toMatch(/Employee Attendance &/i);
  });

  it("uses no purple, blue or indigo — every non-brand colour is a true grey", () => {
    const hexes = [...new Set(template.html.match(/#[0-9a-fA-F]{6}/g) ?? [])];
    expect(hexes.length).toBeGreaterThan(0);

    for (const hex of hexes) {
      if (hex.toUpperCase() === BRAND_GREEN || hex.toUpperCase() === DARK_GREEN) continue;

      const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

      // A neutral has no cast at all: green and blue must equal red. This is
      // what rules out #f4f5fb and #8b90a8, which read as grey until you
      // compare their channels.
      expect({ hex, g, b }).toEqual({ hex, g: r, b: r });
    }
  });

  it("has a subject, an HTML part and a plain-text part", () => {
    expect(template.subject.trim()).not.toBe("");
    expect(template.html.trim()).not.toBe("");
    expect(template.text.trim()).not.toBe("");
  });

  it("interpolated every value it was given", () => {
    const all = `${template.subject}${template.html}${template.text}`;
    expect(all).not.toMatch(/undefined|NaN|\[object Object\]/);
  });

  it("closes every table it opens, so Outlook cannot collapse the layout", () => {
    expect((template.html.match(/<table/g) ?? []).length).toBe(
      (template.html.match(/<\/table>/g) ?? []).length,
    );
  });

  it("is fluid under a fixed maximum, so it reflows on a phone", () => {
    expect(template.html).toContain("max-width:560px");
    expect(template.html).toContain("width:100%");
    expect(template.html).toContain('name="viewport"');
  });

  it("depends on no stylesheet, script or remote asset", () => {
    expect(template.html).not.toMatch(/<script/i);
    expect(template.html).not.toMatch(/<link/i);
    expect(template.html).not.toMatch(/url\(\s*['"]?https?:/i);
  });
});

describe("dynamic content survives the redesign", () => {
  it("keeps the closure's day, date and reason", () => {
    const { html, text, subject } = templates.officeClosed;

    for (const part of [html, text]) {
      expect(part).toContain("Friday");
      expect(part).toContain("August 14, 2026");
      expect(part).toContain("Race Condition Day");
    }

    expect(subject).toBe("Office closed tomorrow — Race Condition Day");
  });

  it("keeps the one-time code in both parts", () => {
    expect(templates.otp.html).toContain("482913");
    expect(templates.otp.text).toContain("482913");
    expect(templates.otp.subject).toContain("482913");
  });

  it("keeps the leave range, reason and remaining balance", () => {
    const { html, subject } = templates.leaveApproved;

    expect(html).toContain("Aug 17, 2026 – Aug 18, 2026");
    expect(html).toContain("2 days");
    expect(html).toContain("Family wedding");
    expect(subject).toContain("Aug 17, 2026");
  });

  it("keeps the invitation link, role and job title", () => {
    expect(templates.invitationEmployee.html).toContain("https://example.test/register?token=abc");
    expect(templates.invitationEmployee.html).toContain("Software Engineer");
    expect(templates.invitationEmployee.html).toContain("Employee");
    expect(templates.invitationAdmin.html).toContain("Administrator");
  });

  it("still distinguishes a first miss from a run", () => {
    expect(templates.attendanceWarningFirst.subject).toBe("Attendance warning — no attendance recorded");
    expect(templates.attendanceWarningRepeat.subject).toContain("3 working days missed");
    expect(templates.attendanceWarningRepeat.html).toContain("3rd working day in a row");
  });
});

describe("user-supplied values are still escaped", () => {
  it("neutralises markup in a name", () => {
    const template = welcomeTemplate('<script>alert("x")</script>');

    expect(template.html).not.toContain("<script>");
    expect(template.html).toContain("&lt;script&gt;");
  });

  it("neutralises markup in a closure reason", () => {
    const template = officeClosedTemplate({
      name: "Ayesha",
      weekday: "Friday",
      date: day("2026-08-14"),
      reason: '<img src=x onerror="alert(1)">',
      closesToday: false,
    });

    // The letterhead legitimately carries two <img> tags now, so "no <img>
    // anywhere" is no longer the invariant. What must hold is narrower and
    // truer: the injected one survives only as escaped text, no attribute of
    // it is ever parsed, and the only real images are the two logos.
    expect(template.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(template.html).not.toMatch(/onerror\s*=\s*"/);
    expect(template.html.match(/<img /g) ?? []).toHaveLength(2);
  });
});

/**
 * The one piece of prose here that is a rule rather than wording.
 *
 * A closure declared for the day it names is announced immediately, which only
 * beats saying nothing if the message says "today". Announcing a same-day
 * closure with the day-before letter is exactly the failure `planHolidayNotice`
 * used to avoid by skipping the announcement altogether, so the wording is
 * pinned rather than left to review.
 */
describe("the office-closed announcement words itself for the day it is sent", () => {
  it("says today, and never tomorrow, for a same-day closure", () => {
    const { subject, html, text } = templates.officeClosedToday;

    expect(subject).toBe("Office closed today — Race Condition Day");
    expect(text).toContain("the office is closed today");

    // The assertion that matters: a stray "tomorrow" anywhere in a same-day
    // announcement sends the whole company in on the wrong day.
    for (const part of [subject, html, text]) expect(part).not.toContain("tomorrow");
  });

  it("keeps the day-before wording for a closure still to come", () => {
    const { subject, text } = templates.officeClosed;

    expect(subject).toBe("Office closed tomorrow — Race Condition Day");
    expect(text).toContain("the office will be closed tomorrow");
    expect(text).not.toContain("closed today");
  });

  it("names the same date either way", () => {
    // Formatted in UTC, like every other calendar date here: a closure is a day,
    // not an instant, so it must not shift with the reader's zone.
    for (const template of [templates.officeClosed, templates.officeClosedToday]) {
      expect(template.text).toContain("Friday, August 14, 2026");
    }
  });
});

describe("the complaint resolution letter", () => {
  const { subject, html, text } = templates.complaintResolved;

  it("carries the complaint's identity, so a reply can be matched to it", () => {
    for (const part of [html, text]) {
      expect(part).toContain("ZV-8F3K2A9C");
      expect(part).toContain("Air conditioning is broken");
    }

    expect(subject).toContain("Air conditioning is broken");
  });

  it("quotes the resolution in both parts", () => {
    // The plain-text half is the one nobody looks at until a client refuses
    // HTML, which is exactly when a missing resolution would matter most.
    for (const part of [html, text]) {
      expect(part).toContain("Facilities replaced the compressor on Friday.");
    }
  });

  it("keeps the paragraphs a resolution was written with", () => {
    // A multi-line resolution arriving as one run-on line is the difference
    // between a decision somebody can read and a wall of text.
    expect(html).toContain("Friday.<br />It has been running since.");
  });

  it("names who resolved it and when, on the company's clock", () => {
    for (const part of [html, text]) {
      expect(part).toContain("System Administrator");
      // 09:30 UTC is 2:30 PM in Asia/Karachi, which is the wall clock the
      // employee and the administrator share.
      expect(part).toContain("2:30 PM");
    }
  });

  it("says it is resolved, and never says rejected", () => {
    expect(html).toContain("resolved");
    for (const part of [subject, html, text]) expect(part.toLowerCase()).not.toContain("rejected");
  });

  it("points at the employee's own complaints screen", () => {
    expect(html).toContain("/complaints");
    expect(text).toContain("/complaints");
  });
});
