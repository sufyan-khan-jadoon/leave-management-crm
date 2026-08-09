"use client";

import { useCallback, useEffect, useRef } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * A small rich-text field, built on `contentEditable` and nothing else.
 *
 * Deliberately not a dependency. The grammar this needs to produce is six marks
 * wide — bold, italic, underline, two kinds of list, and a link — and a real
 * editor framework would add hundreds of kilobytes to an admin screen to express
 * it. `document.execCommand` is formally deprecated and still the only thing
 * every browser implements for this; it is used here for exactly those six
 * commands and nothing structural.
 *
 * **This component is a convenience, not a control.** Whatever HTML it produces
 * is re-parsed server-side against the allowlist in `sanitize-html.ts` before it
 * reaches an email, so a pasted document, a hand-edited DOM or a browser quirk
 * cannot put markup into a message. Don't move that check here to save a round
 * trip — the client's copy of a rule is a courtesy, never the rule.
 */
export function RichTextEditor({
  value,
  onChange,
  disabled,
  placeholder,
  id,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Written into the DOM only when the two have genuinely diverged. Assigning
  // innerHTML on every render would move the caret to the start on each
  // keystroke, which is the classic way this component goes wrong.
  useEffect(() => {
    const node = ref.current;
    if (node && node.innerHTML !== value) node.innerHTML = value;
  }, [value]);

  const emit = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  function run(command: string, argument?: string) {
    if (disabled) return;

    // Focus first: a command issued while the toolbar holds focus applies to
    // nothing, which reads as the button being broken.
    ref.current?.focus();
    document.execCommand(command, false, argument);
    emit();
  }

  function addLink() {
    const url = window.prompt("Link address", "https://");
    if (!url) return;

    // Mirrors the server's allowlist so the obvious mistake is caught while the
    // author is still looking at it. The server refuses these regardless.
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      window.alert("Links must start with http://, https:// or mailto:");
      return;
    }

    run("createLink", url.trim());
  }

  const tools = [
    { icon: Bold, label: "Bold", action: () => run("bold") },
    { icon: Italic, label: "Italic", action: () => run("italic") },
    { icon: Underline, label: "Underline", action: () => run("underline") },
    { icon: List, label: "Bulleted list", action: () => run("insertUnorderedList") },
    { icon: ListOrdered, label: "Numbered list", action: () => run("insertOrderedList") },
    { icon: Link2, label: "Insert link", action: addLink },
  ];

  const isEmpty = value.replace(/<[^>]*>/g, "").trim().length === 0;

  return (
    <div
      className={cn(
        "border-input bg-background overflow-hidden rounded-lg border",
        "focus-within:border-primary focus-within:ring-primary/25 focus-within:ring-[3px]",
        disabled && "opacity-60",
      )}
    >
      <div className="border-border/60 bg-muted/30 flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        {tools.map(({ icon: Icon, label, action }, index) => (
          <div key={label} className="flex items-center">
            {index === 3 && <Separator orientation="vertical" className="mx-1 !h-5" />}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              // Keeps the selection alive: a mousedown that moves focus would
              // collapse it before the command could apply to anything.
              onMouseDown={(event) => event.preventDefault()}
              onClick={action}
              disabled={disabled}
              aria-label={label}
              title={label}
            >
              <Icon className="size-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="relative">
        {isEmpty && placeholder && (
          <span className="text-muted-foreground pointer-events-none absolute left-3.5 top-3 text-sm">
            {placeholder}
          </span>
        )}

        <div
          id={id}
          ref={ref}
          contentEditable={!disabled}
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          onInput={emit}
          onBlur={emit}
          // Pasted content arrives as plain text on purpose. A paste from a word
          // processor carries a document's worth of markup that the server would
          // strip anyway, and the author would have watched their formatting
          // vanish somewhere between here and the inbox.
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
            emit();
          }}
          className={cn(
            "min-h-56 w-full overflow-y-auto px-3.5 py-3 text-sm leading-relaxed outline-none",
            "[&_a]:text-primary-ink [&_a]:underline",
            "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
            "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
          )}
        />
      </div>
    </div>
  );
}
