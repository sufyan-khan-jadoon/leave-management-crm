/**
 * What may be attached to a custom email, as arithmetic.
 *
 * Extracted for the reason `email-audience.ts`, `geo.ts` and `working-days.ts`
 * were: this is the security rule of the attachment feature, and a rule that can
 * only be exercised by standing up a mail server is a rule nobody exercises.
 * Everything here is a pure function of a file's *name* and *size* — no Buffer,
 * no request, no Prisma — so `email-attachments.test.ts` can enumerate the whole
 * allowlist, both refusals and every edge of the sanitiser.
 *
 * The composer imports the same functions to warn while the sender is still
 * looking at the file picker. That copy is a courtesy, never the rule:
 * `custom-email.service.ts` judges the files again, on the bytes that actually
 * arrived, exactly as `sanitize-html.ts` re-judges what the editor produced.
 */
import { MAX_EMAIL_ATTACHMENTS, MAX_EMAIL_ATTACHMENT_BYTES } from "@/lib/constants";

/** A file as the picker describes one: everything known before reading a byte. */
export type AttachmentClaim = { name: string; size: number };

/**
 * The allowlist, keyed by extension — and the extension is what decides the MIME
 * type the message carries.
 *
 * An allowlist rather than a list of banned extensions, because the dangerous
 * set is open-ended: `.exe`, `.bat`, `.cmd`, `.sh`, `.php`, `.js`, `.msi`,
 * `.scr`, and whichever one is invented next. Naming what is permitted means a
 * new executable format is refused on the day it appears rather than on the day
 * somebody remembers to add it here.
 *
 * The browser's `file.type` is read nowhere. It is a claim from the client, and
 * believing it would let `payroll.exe` be delivered labelled `application/pdf`,
 * or a genuine PDF be labelled `text/html` and rendered inline by a mail client.
 * Deriving the type from the extension we already allowlisted means the label
 * and the name can never disagree.
 *
 * Archives are absent on purpose: a `.zip` is a container for whatever is inside
 * it, so allowing one would allow everything above by wrapping it. SVG is absent
 * for the same reason at a smaller scale — it is a document that can carry
 * script, not an image.
 */
export const ALLOWED_ATTACHMENT_TYPES = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv",
  txt: "text/plain",
  rtf: "application/rtf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
} as const satisfies Record<string, string>;

export type AllowedExtension = keyof typeof ALLOWED_ATTACHMENT_TYPES;

/** For the file picker's `accept`, and for saying out loud what is allowed. */
export const ACCEPTED_ATTACHMENT_EXTENSIONS = Object.keys(ALLOWED_ATTACHMENT_TYPES).map(
  (extension) => `.${extension}`,
);

/**
 * Long enough for a real document name, short enough that no mail client
 * truncates it into something unrecognisable.
 */
const MAX_ATTACHMENT_NAME_LENGTH = 100;

/** Used when sanitising leaves nothing behind — never an empty filename. */
const FALLBACK_ATTACHMENT_NAME = "attachment";

/** Everything a filename may keep: letters, digits, dot, underscore, hyphen, space. */
const SAFE_NAME_CHARACTERS = /[^A-Za-z0-9._ -]/g;

/**
 * C0 controls and DEL. Stripped rather than substituted, because a carriage
 * return in a filename is a header injection rather than an unusual character.
 */
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/** A file that passed, ready to be turned into a MIME part. */
export type JudgedAttachment = { filename: string; contentType: string; size: number };

export type AttachmentVerdict =
  | ({ ok: true } & JudgedAttachment)
  /** Refused, with the sentence to show the sender. Never a stack trace. */
  | { ok: false; reason: "empty" | "type" | "size"; message: string };

export type AttachmentsVerdict =
  | { ok: true; files: JudgedAttachment[] }
  | { ok: false; reason: "empty" | "type" | "size" | "count"; message: string };

/** The extension, lowercased and without its dot. `""` when there isn't one. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

function isAllowed(extension: string): extension is AllowedExtension {
  return Object.hasOwn(ALLOWED_ATTACHMENT_TYPES, extension);
}

/**
 * A filename fit to put in a header and hand to a mail client.
 *
 * Three separate things are being defended against, which is why this does more
 * than strip slashes:
 *
 * - **Path components.** `../../etc/passwd` becomes `passwd`. Nothing here ever
 *   touches the filesystem, but the name travels into a `Content-Disposition`
 *   header and then into whatever directory the recipient saves it to, and that
 *   is somebody else's filesystem.
 * - **Control characters.** A carriage return in a filename is a header
 *   injection: everything after it would be read as a new MIME header.
 * - **Leading dots.** `.bashrc` is a hidden file on the recipient's machine, and
 *   a name that begins with a dot has no visible stem to read.
 *
 * Truncation keeps the extension rather than the first hundred characters,
 * because the extension is the part that tells the recipient's machine what the
 * file is — losing it would turn a long-named PDF into something unopenable.
 */
export function sanitizeAttachmentName(raw: string): string {
  const base = (raw.split(/[\\/]/).pop() ?? "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(SAFE_NAME_CHARACTERS, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim();

  if (!base) return FALLBACK_ATTACHMENT_NAME;
  if (base.length <= MAX_ATTACHMENT_NAME_LENGTH) return base;

  const dot = base.lastIndexOf(".");
  const suffix = dot > 0 ? base.slice(dot) : "";
  const stem = (dot > 0 ? base.slice(0, dot) : base).slice(
    0,
    Math.max(1, MAX_ATTACHMENT_NAME_LENGTH - suffix.length),
  );

  return `${stem}${suffix}`;
}

/** Bytes as a person reads them. Shared so a refusal and the chip beside it agree. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The budget, phrased once so every message about it reads the same. */
const budgetLabel = () => formatFileSize(MAX_EMAIL_ATTACHMENT_BYTES);

/**
 * One file, judged.
 *
 * Emptiness is checked before type: a zero-byte file is a failed read or a
 * placeholder somebody dragged in by mistake, and "that file is empty" is more
 * use than a lecture about extensions it may well satisfy.
 */
export function judgeAttachment(claim: AttachmentClaim): AttachmentVerdict {
  const filename = sanitizeAttachmentName(claim.name);
  const extension = extensionOf(filename);

  if (!Number.isFinite(claim.size) || claim.size <= 0) {
    return { ok: false, reason: "empty", message: `"${filename}" is empty, so there is nothing to attach.` };
  }

  if (!isAllowed(extension)) {
    return {
      ok: false,
      reason: "type",
      message: `"${filename}" is not a file type that can be emailed. Documents, spreadsheets, PDFs and images are allowed; programs and archives are not.`,
    };
  }

  if (claim.size > MAX_EMAIL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: "size",
      message: `"${filename}" is ${formatFileSize(claim.size)}, over the ${budgetLabel()} limit for one message.`,
    };
  }

  return { ok: true, filename, contentType: ALLOWED_ATTACHMENT_TYPES[extension], size: claim.size };
}

/**
 * Every file on one message, judged together.
 *
 * The whole set is refused on the first bad file rather than the good ones being
 * sent without it. A message that quietly went out missing its attachment is
 * worse than one that did not go out at all: the sender believes the file
 * arrived, and an email cannot be recalled to add it.
 *
 * The total is checked last, after each file has passed on its own, so a single
 * oversized file is reported as itself rather than as an arithmetic problem
 * about a set of one.
 */
export function judgeAttachments(claims: AttachmentClaim[]): AttachmentsVerdict {
  if (claims.length > MAX_EMAIL_ATTACHMENTS) {
    return {
      ok: false,
      reason: "count",
      message: `One message can carry ${MAX_EMAIL_ATTACHMENTS} files at most. Remove ${claims.length - MAX_EMAIL_ATTACHMENTS} of them.`,
    };
  }

  const files: JudgedAttachment[] = [];

  for (const claim of claims) {
    const verdict = judgeAttachment(claim);
    if (!verdict.ok) return verdict;

    files.push({ filename: verdict.filename, contentType: verdict.contentType, size: verdict.size });
  }

  const total = files.reduce((sum, file) => sum + file.size, 0);

  if (total > MAX_EMAIL_ATTACHMENT_BYTES) {
    return {
      ok: false,
      reason: "size",
      message: `Those ${files.length} files come to ${formatFileSize(total)} together, over the ${budgetLabel()} limit for one message.`,
    };
  }

  return { ok: true, files };
}
