"use client";

import { Fragment, useCallback, useRef, useState } from "react";
import { BotMessageSquare, SendHorizontal, Trash2, User, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useStickToBottom } from "@/hooks/use-stick-to-bottom";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { toActionRequest, type AdminChatAction } from "@/validations/admin-chat.schema";

type Turn = { role: "user" | "assistant"; content: string };

type PersonChoice = {
  id: string;
  name: string;
  email: string;
  department: string | null;
  position: string | null;
};

type Pending = { view: "status" | "history" | "remove"; date: string; endDate: string | null };

/**
 * An act the server is asking approval for.
 *
 * It carries two different things and they must not be confused: the **inputs**
 * that identify the act, and `name`, which exists only to label the button.
 * `toActionRequest` sends the first and drops the second — everything else is
 * re-read from the database when it runs, so echoing it back would be handing the
 * server its own display copy to ignore.
 *
 * This component posted the whole object once, and every deletion was refused with
 * "The submitted data is invalid" while invitations worked, since those happen to
 * be inputs all the way through.
 */
type PendingAction = AdminChatAction;

type ChatReply = {
  reply: string;
  choices?: PersonChoice[];
  pending?: Pending;
  action?: PendingAction;
};

const GREETING: Turn = {
  role: "assistant",
  content:
    "Ask me about attendance or leave — **who is absent today**, **where is Sufyan**, **show me yesterday's attendance**.\n\nI can also add or remove staff: **invite sara@example.com as an employee**, or **delete Ahmed's account**. I'll show you exactly what I'm about to do and wait for you to approve it.",
};

/**
 * Openers worth one tap.
 *
 * The three questions this screen exists for. They double as a statement of
 * what it can be asked, which a blank box does not make: an assistant that
 * answers anything is indistinguishable from one that answers nothing until
 * you have guessed its vocabulary.
 */
const SUGGESTIONS = [
  "Who is absent today?",
  "Who is present today?",
  "Who is on leave today?",
  "Show me yesterday's attendance",
];

/**
 * Renders the **bold** the service emits, and nothing else.
 *
 * Deliberately not a markdown library. The replies are built by
 * `admin-chat.service.ts`, so the set of syntax in them is known exactly —
 * bold headings and totals, bullets and numbers that are already plain text.
 * Pulling in a parser to handle the rest would also mean sanitising it, and
 * the one thing the model can influence here is its own short acknowledgement.
 */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={index} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * The workforce assistant, for administrators.
 *
 * A read-only conversation: it answers about attendance and leave and has no
 * way to change either, which is why — unlike the employee's leave chat — there
 * is no proposal to confirm and no undo to offer.
 *
 * The one piece of state worth understanding is the disambiguation. When a name
 * matches several people the server sends the candidates and the question it
 * was about to answer; choosing sends that question back with a unique id, and
 * the answer is computed fresh. The name is never used as the identifier.
 */
export function AdminChat({ className }: { className?: string }) {
  const [turns, setTurns] = useState<Turn[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<PersonChoice[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [action, setAction] = useState<PendingAction | null>(null);
  const turnsRef = useRef<Turn[]>(turns);

  turnsRef.current = turns;

  const addReply = useCallback((result: ChatReply) => {
    setTurns((current) => [...current, { role: "assistant", content: result.reply }]);
    setChoices(result.choices ?? null);
    setPending(result.pending ?? null);
    setAction(result.action ?? null);
  }, []);

  const ask = useCallback(
    async (message: string) => {
      const next = [...turnsRef.current, { role: "user" as const, content: message }];
      setTurns(next);
      setDraft("");
      // A new question supersedes anything still awaiting an answer — including a
      // proposal, which must never survive the question that produced it.
      setChoices(null);
      setPending(null);
      setAction(null);
      setBusy(true);

      try {
        addReply(await apiClient.post<ChatReply>("/api/admin/chat", { messages: next }));
      } catch (error) {
        const text =
          error instanceof ApiClientError ? error.message : "Something went wrong. Please try again.";

        setTurns((current) => [...current, { role: "assistant", content: text }]);
        toast.error(text);
      } finally {
        setBusy(false);
      }
    },
    [addReply],
  );

  /** Re-asks the same question against one unambiguous person. */
  const choose = useCallback(
    async (choice: PersonChoice) => {
      if (!pending || busy) return;

      // The address rather than the job title, for the reason the buttons show
      // it: the transcript has to record which of two same-named colleagues was
      // picked, and only this tells them apart.
      const label = `${choice.name} — ${choice.email}`;
      setTurns((current) => [...current, { role: "user", content: label }]);
      setChoices(null);
      setAction(null);
      setBusy(true);

      try {
        addReply(
          await apiClient.post<ChatReply>("/api/admin/chat", {
            messages: turnsRef.current,
            resolved: { employeeId: choice.id, ...pending },
          }),
        );
      } catch (error) {
        const text = error instanceof ApiClientError ? error.message : "That could not be looked up.";

        setTurns((current) => [...current, { role: "assistant", content: text }]);
        toast.error(text);
      } finally {
        setBusy(false);
      }
    },
    [addReply, busy, pending],
  );

  /**
   * Carries out the proposal on screen.
   *
   * Posts to the action endpoint rather than the chat one, sending the inputs the
   * proposal was built from. That the act performed is the act described is not
   * something this component can promise anyway — it is the server re-reading the
   * row behind the id that makes it true.
   */
  const confirm = useCallback(async () => {
    if (!action || busy) return;

    setTurns((current) => [
      ...current,
      { role: "user", content: action.kind === "remove" ? "Yes, delete the account" : "Yes, send the invitation" },
    ]);
    // Cleared before the request, not after: a second press must not be able to
    // send a delete twice while the first is still in flight.
    setAction(null);
    setBusy(true);

    try {
      addReply(await apiClient.post<ChatReply>("/api/admin/chat/action", toActionRequest(action)));
    } catch (error) {
      const text = error instanceof ApiClientError ? error.message : "That could not be completed.";

      setTurns((current) => [...current, { role: "assistant", content: text }]);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }, [action, addReply, busy]);

  // Scrolls the transcript alone. Never the page — see `useStickToBottom`.
  const listRef = useStickToBottom<HTMLDivElement>([turns, choices, action]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const message = draft.trim();
    if (!message || busy) return;

    await ask(message);
  }

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-0">
        <div
          ref={listRef}
          className="scrollbar-thin max-h-[30rem] min-h-[18rem] flex-1 space-y-4 overflow-y-auto px-4 pt-4"
        >
          {turns.map((turn, index) => (
            <div
              key={index}
              className={cn("flex gap-2.5", turn.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              <div
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  turn.role === "user"
                    ? "bg-primary/10 text-primary-ink"
                    : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {turn.role === "user" ? (
                  <User className="size-3.5" />
                ) : (
                  <BotMessageSquare className="size-3.5" />
                )}
              </div>

              <div
                className={cn(
                  "animate-in fade-in-0 zoom-in-95 max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-line duration-300 ease-spring",
                  turn.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm shadow-[inset_0_1px_0_0_oklch(1_0_0/20%),0_4px_12px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                    : "glass-subtle rounded-tl-sm",
                )}
              >
                <RichText text={turn.content} />
              </div>
            </div>
          ))}

          {/* The disambiguation. Rendered as buttons rather than asking the
              administrator to retype a fuller name, because the id behind each
              one is the whole point — a retyped name could still match two. */}
          {choices && !busy && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-1 ml-9 grid gap-2 duration-300 ease-spring">
              {choices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => choose(choice)}
                  className="glass-subtle hover:bg-primary/6 focus-visible:ring-ring flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Users className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="font-medium">{choice.name}</span>

                    {[choice.position, choice.department].filter(Boolean).length > 0 && (
                      <span className="text-muted-foreground block text-xs">
                        {[choice.position, choice.department].filter(Boolean).join(" · ")}
                      </span>
                    )}

                    {/* Always shown, never conditional: it is the only field
                        guaranteed to differ, and two identical buttons are not a
                        choice. */}
                    <span className="text-muted-foreground block truncate text-xs">{choice.email}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* The approval. Two buttons, both explicit, and the destructive one
              styled as such — nothing here is the default action, and no Enter
              press in the composer can reach it. */}
          {action && !busy && (
            <div className="animate-in fade-in-0 slide-in-from-bottom-1 ml-9 flex flex-wrap items-center gap-2 duration-300 ease-spring">
              <Button
                type="button"
                size="sm"
                variant={action.kind === "remove" ? "destructive" : "default"}
                onClick={confirm}
              >
                {action.kind === "remove" ? (
                  <>
                    <Trash2 className="size-4" />
                    Delete {action.name}
                  </>
                ) : (
                  <>
                    <UserPlus className="size-4" />
                    Send invitation
                  </>
                )}
              </Button>

              <Button type="button" size="sm" variant="outline" onClick={() => setAction(null)}>
                Cancel
              </Button>
            </div>
          )}

          {busy && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full" />
            </div>
          )}

        </div>

        {turns.length === 1 && !busy && (
          <div className="flex flex-wrap gap-2 px-4">
            {SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => ask(suggestion)}
                disabled={busy}
              >
                {suggestion}
              </Button>
            ))}
          </div>
        )}

        <form
          onSubmit={submit}
          className="border-border/60 glass-subtle flex items-center gap-2 border-t p-3"
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Who is absent today?"
            disabled={busy}
            maxLength={600}
            aria-label="Ask the workforce assistant"
          />

          <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
            <SendHorizontal className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
