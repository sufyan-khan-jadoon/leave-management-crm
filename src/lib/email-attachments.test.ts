/**
 * The attachment rules, exercised without a mail server.
 *
 * The interesting assertions here are the negative ones: every shape of
 * executable is refused, the type is taken from the name rather than from
 * anything a client said, and a filename carrying a path, a newline or a leading
 * dot comes out as something safe to put in a header.
 */
import { describe, expect, it } from "vitest";

import { MAX_EMAIL_ATTACHMENTS, MAX_EMAIL_ATTACHMENT_BYTES } from "@/lib/constants";
import {
  ACCEPTED_ATTACHMENT_EXTENSIONS,
  extensionOf,
  formatFileSize,
  judgeAttachment,
  judgeAttachments,
  sanitizeAttachmentName,
} from "@/lib/email-attachments";

const KB = 1024;

/** A file that would pass, unless the test bends one of its fields. */
const file = (name: string, size = 12 * KB) => ({ name, size });

describe("judgeAttachment — what may be sent", () => {
  it.each([
    ["report.pdf", "application/pdf"],
    ["notes.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["figures.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ["photo.png", "image/png"],
    ["scan.jpeg", "image/jpeg"],
    ["export.csv", "text/csv"],
  ])("accepts %s and labels it %s", (name, contentType) => {
    const verdict = judgeAttachment(file(name));

    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.contentType).toBe(contentType);
  });

  it("reads the extension case-insensitively", () => {
    const verdict = judgeAttachment(file("QUARTERLY.PDF"));

    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.contentType).toBe("application/pdf");
    // The name keeps the case the sender chose; only the lookup is lowered.
    expect(verdict.ok && verdict.filename).toBe("QUARTERLY.PDF");
  });
});

describe("judgeAttachment — what may not", () => {
  it.each([
    "payroll.exe",
    "setup.msi",
    "run.bat",
    "run.cmd",
    "deploy.sh",
    "index.php",
    "script.js",
    "macro.vbs",
    "screensaver.scr",
    "bundle.zip",
    "archive.rar",
    "logo.svg",
    "database.sql",
  ])("refuses %s", (name) => {
    const verdict = judgeAttachment(file(name));

    expect(verdict).toMatchObject({ ok: false, reason: "type" });
  });

  it("refuses a file with no extension at all", () => {
    expect(judgeAttachment(file("README"))).toMatchObject({ ok: false, reason: "type" });
  });

  /**
   * The last extension is the one an operating system obeys, so it is the one
   * judged here. `invoice.pdf.exe` is an executable wearing a document's name.
   */
  it("judges the last extension, not the first", () => {
    expect(judgeAttachment(file("invoice.pdf.exe"))).toMatchObject({ ok: false, reason: "type" });
    expect(judgeAttachment(file("invoice.exe.pdf")).ok).toBe(true);
  });

  it("refuses an empty file before complaining about its type", () => {
    expect(judgeAttachment(file("payroll.exe", 0))).toMatchObject({ ok: false, reason: "empty" });
    expect(judgeAttachment(file("report.pdf", 0))).toMatchObject({ ok: false, reason: "empty" });
  });

  it("accepts a file exactly at the limit and refuses the byte after it", () => {
    expect(judgeAttachment(file("report.pdf", MAX_EMAIL_ATTACHMENT_BYTES)).ok).toBe(true);
    expect(judgeAttachment(file("report.pdf", MAX_EMAIL_ATTACHMENT_BYTES + 1))).toMatchObject({
      ok: false,
      reason: "size",
    });
  });

  it("names the file in every refusal, so the sender knows which one to remove", () => {
    const verdict = judgeAttachment(file("holiday photo.exe"));

    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.message).toContain("holiday photo.exe");
  });
});

describe("sanitizeAttachmentName", () => {
  it("keeps an ordinary name untouched", () => {
    expect(sanitizeAttachmentName("Q3 report-final_v2.pdf")).toBe("Q3 report-final_v2.pdf");
  });

  it.each([
    ["../../etc/passwd.txt", "passwd.txt"],
    ["C:\\Users\\me\\Desktop\\notes.txt", "notes.txt"],
    ["folder/sub/report.pdf", "report.pdf"],
  ])("strips the path from %s", (raw, expected) => {
    expect(sanitizeAttachmentName(raw)).toBe(expected);
  });

  it("removes control characters rather than replacing them", () => {
    // A newline here would start a new MIME header on the recipient's side.
    expect(sanitizeAttachmentName("report\r\nX-Injected: yes.pdf")).toBe("reportX-Injected_ yes.pdf");
  });

  it("refuses to produce a hidden file", () => {
    expect(sanitizeAttachmentName(".bashrc")).toBe("bashrc");
    expect(sanitizeAttachmentName("...notes.txt")).toBe("notes.txt");
  });

  it("never returns an empty name", () => {
    expect(sanitizeAttachmentName("")).toBe("attachment");
    expect(sanitizeAttachmentName("...")).toBe("attachment");
    expect(sanitizeAttachmentName("   ")).toBe("attachment");
  });

  it("keeps the extension when the name is too long to keep whole", () => {
    const name = `${"a".repeat(300)}.pdf`;
    const sanitized = sanitizeAttachmentName(name);

    expect(sanitized.length).toBeLessThanOrEqual(100);
    expect(sanitized.endsWith(".pdf")).toBe(true);
    expect(judgeAttachment(file(name)).ok).toBe(true);
  });
});

describe("judgeAttachments — the set as a whole", () => {
  it("accepts a message with no attachments at all", () => {
    expect(judgeAttachments([])).toEqual({ ok: true, files: [] });
  });

  it("accepts several files under the budget", () => {
    const verdict = judgeAttachments([file("a.pdf"), file("b.png"), file("c.docx")]);

    expect(verdict.ok).toBe(true);
    expect(verdict.ok && verdict.files.map((f) => f.filename)).toEqual(["a.pdf", "b.png", "c.docx"]);
  });

  it("refuses more files than one message may carry", () => {
    const many = Array.from({ length: MAX_EMAIL_ATTACHMENTS + 1 }, (_, i) => file(`file-${i}.pdf`));

    expect(judgeAttachments(many)).toMatchObject({ ok: false, reason: "count" });
  });

  it("refuses the whole set when one file is refused", () => {
    const verdict = judgeAttachments([file("fine.pdf"), file("payroll.exe"), file("also-fine.png")]);

    expect(verdict).toMatchObject({ ok: false, reason: "type" });
  });

  it("refuses files that only exceed the budget together", () => {
    const half = Math.ceil(MAX_EMAIL_ATTACHMENT_BYTES / 2);
    const verdict = judgeAttachments([file("a.pdf", half), file("b.pdf", half), file("c.pdf", half)]);

    expect(verdict).toMatchObject({ ok: false, reason: "size" });
    expect(!verdict.ok && verdict.message).toContain("together");
  });
});

describe("presentation helpers", () => {
  it("formats sizes the way the composer shows them", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1_500_000)).toBe("1.4 MB");
  });

  it("offers every allowed extension to the file picker", () => {
    expect(ACCEPTED_ATTACHMENT_EXTENSIONS).toContain(".pdf");
    expect(ACCEPTED_ATTACHMENT_EXTENSIONS).not.toContain(".exe");
    expect(ACCEPTED_ATTACHMENT_EXTENSIONS.every((entry) => entry.startsWith("."))).toBe(true);
  });

  it("reads an extension only after a stem", () => {
    expect(extensionOf("report.pdf")).toBe("pdf");
    expect(extensionOf("REPORT.PDF")).toBe("pdf");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(".pdf")).toBe("");
  });
});
