"use client";

import { useRef } from "react";
import { FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MAX_EMAIL_ATTACHMENTS, MAX_EMAIL_ATTACHMENT_BYTES } from "@/lib/constants";
import {
  ACCEPTED_ATTACHMENT_EXTENSIONS,
  extensionOf,
  formatFileSize,
  judgeAttachments,
} from "@/lib/email-attachments";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp"]);

/**
 * Files chosen but not yet sent.
 *
 * The picked files are held as `File` objects and handed to the composer
 * untouched — never read into a data URL the way an avatar is. An attachment is
 * megabytes rather than kilobytes, and base64 in a JSON body would inflate it by
 * a third for no gain; `FormData` carries the same bytes as they are.
 *
 * The rules it checks against are the server's own, imported from
 * `email-attachments.ts` rather than restated here, so a file this screen accepts
 * is one the send will accept. That is a courtesy — refusing the obvious mistake
 * while the sender is still looking at the picker — and never the rule itself,
 * which is applied again on the bytes that arrive.
 */
export function EmailAttachmentsField({
  files,
  onChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const total = files.reduce((sum, file) => sum + file.size, 0);

  function add(picked: FileList | null) {
    if (!picked?.length) return;

    // Same name, size and timestamp is the same file picked twice — a second
    // copy would spend the budget on a duplicate the recipient has to sort out.
    const seen = new Set(files.map(identity));
    const candidates = [...files, ...Array.from(picked).filter((file) => !seen.has(identity(file)))];

    const verdict = judgeAttachments(candidates.map(({ name, size }) => ({ name, size })));

    if (!verdict.ok) {
      // The whole pick is dropped rather than partly applied: a list that
      // silently kept two of the three files chosen is worse than being asked
      // to choose again.
      toast.error(verdict.message);
      return;
    }

    onChange(candidates);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="email-attachments">Attachments</Label>

      <div className="rounded-md border border-dashed p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || files.length >= MAX_EMAIL_ATTACHMENTS}
            onClick={() => inputRef.current?.click()}
          >
            <Paperclip className="size-4" />
            Add file
          </Button>

          <p className="text-muted-foreground text-xs">
            {files.length === 0
              ? `Up to ${MAX_EMAIL_ATTACHMENTS} files, ${formatFileSize(MAX_EMAIL_ATTACHMENT_BYTES)} in total. Documents, spreadsheets, PDFs and images.`
              : `${files.length} of ${MAX_EMAIL_ATTACHMENTS} files · ${formatFileSize(total)} of ${formatFileSize(MAX_EMAIL_ATTACHMENT_BYTES)}`}
          </p>
        </div>

        {files.length > 0 && (
          <ul className="mt-3 grid gap-2">
            {files.map((file, index) => {
              const extension = extensionOf(file.name);
              const Icon = IMAGE_EXTENSIONS.has(extension) ? ImageIcon : FileText;

              return (
                <li
                  key={identity(file)}
                  className="bg-muted/40 flex items-center gap-3 rounded-md border px-3 py-2"
                >
                  <Icon className="text-primary-ink size-4 shrink-0" aria-hidden />

                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.name}</span>

                  <span className="text-muted-foreground shrink-0 text-xs uppercase">
                    {extension || "file"}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatFileSize(file.size)}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0"
                    disabled={disabled}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onChange(files.filter((_, position) => position !== index))}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <input
        ref={inputRef}
        id="email-attachments"
        type="file"
        multiple
        accept={ACCEPTED_ATTACHMENT_EXTENSIONS.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          add(event.target.files);
          // Cleared so picking the same file again after removing it still fires
          // a change event.
          event.target.value = "";
        }}
      />
    </div>
  );
}

/** Enough to tell two picked files apart without reading either of them. */
function identity(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}
