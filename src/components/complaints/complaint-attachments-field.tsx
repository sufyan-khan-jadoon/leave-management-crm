"use client";

import { useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  MAX_COMPLAINT_ATTACHMENTS,
  MAX_COMPLAINT_ATTACHMENT_BYTES,
} from "@/lib/constants";
import { formatFileSize } from "@/lib/email-attachments";

/** One chosen file, already read into the data URL the API expects. */
export type PickedAttachment = { filename: string; data: string };

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,application/pdf";

/**
 * Picking files to attach to a complaint.
 *
 * Reads each file into a **data URL in the browser**, which is the project's
 * existing answer to file storage — the same one `profilePhoto` uses, with no
 * object store to stand up. The request is therefore ordinary JSON rather than
 * the multipart the email composer sends, and that difference is deliberate:
 * these bytes are going into a row rather than onto an SMTP envelope, so they
 * have to reach the database as a string either way.
 *
 * Everything checked here is checked again by `submitComplaintSchema` on the
 * bytes that actually arrived. This copy is a courtesy so somebody learns their
 * file is too big while still looking at the picker, exactly as
 * `EmailAttachmentsField` is a courtesy over `judgeAttachments`.
 */
export function ComplaintAttachmentsField({
  files,
  onChange,
  disabled = false,
}: {
  files: PickedAttachment[];
  onChange: (files: PickedAttachment[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const total = files.reduce((sum, file) => sum + file.data.length, 0);

  async function add(chosen: FileList | null) {
    if (!chosen?.length) return;
    setError(null);

    const room = MAX_COMPLAINT_ATTACHMENTS - files.length;
    if (room <= 0) {
      setError(`You can attach at most ${MAX_COMPLAINT_ATTACHMENTS} files.`);
      return;
    }

    const picked = Array.from(chosen).slice(0, room);
    const read = await Promise.all(picked.map(toDataUrl));

    const accepted = read.filter((file): file is PickedAttachment => file !== null);
    if (accepted.length < read.length) setError("Some files could not be read.");

    const next = [...files, ...accepted];
    const size = next.reduce((sum, file) => sum + file.data.length, 0);

    // Refused whole rather than partly added: a picker that silently kept two of
    // the three files somebody chose is how a complaint gets filed missing its
    // evidence.
    if (size > MAX_COMPLAINT_ATTACHMENT_BYTES) {
      setError(`Those files come to more than ${formatFileSize(MAX_COMPLAINT_ATTACHMENT_BYTES)} together.`);
      return;
    }

    onChange(next);
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="complaint-attachments">Attachments (optional)</Label>

      <input
        ref={input}
        id="complaint-attachments"
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          void add(event.target.files);
          // Cleared so choosing the same file twice in a row still fires.
          event.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || files.length >= MAX_COMPLAINT_ATTACHMENTS}
          onClick={() => input.current?.click()}
        >
          <Paperclip className="size-4" />
          Add files
        </Button>

        <span className="text-muted-foreground text-xs">
          {files.length === 0
            ? `Up to ${MAX_COMPLAINT_ATTACHMENTS} images or PDFs, ${formatFileSize(MAX_COMPLAINT_ATTACHMENT_BYTES)} in total.`
            : `${files.length} of ${MAX_COMPLAINT_ATTACHMENTS} files · ${formatFileSize(total)}`}
        </span>
      </div>

      {files.length > 0 && (
        <ul className="space-y-1">
          {files.map((file, index) => (
            <li
              key={`${file.filename}-${index}`}
              className="border-border/60 bg-muted/30 flex items-center gap-2 rounded-lg border px-3 py-2"
            >
              <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
              <span className="mr-auto min-w-0 truncate text-sm">{file.filename}</span>
              <span className="text-muted-foreground shrink-0 text-xs">{formatFileSize(file.data.length)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(files.filter((_, at) => at !== index))}
                className="hover:bg-foreground/10 rounded-full p-1 transition-colors"
                aria-label={`Remove ${file.filename}`}
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-destructive-ink text-xs">{error}</p>}
    </div>
  );
}

function toDataUrl(file: File): Promise<PickedAttachment | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();

    reader.onerror = () => resolve(null);
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? { filename: file.name, data: reader.result } : null);

    reader.readAsDataURL(file);
  });
}
