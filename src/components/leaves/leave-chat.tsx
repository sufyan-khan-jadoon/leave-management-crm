"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, SendHorizontal, User, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Turn = { role: "user" | "assistant"; content: string };

type Proposal = {
  startDate: string;
  days: number;
  reason: string;
  dates: string[];
  remainingAfter: number;
};

type ChatReply = { reply: string; proposal?: Proposal };

const GREETING: Turn = {
  role: "assistant",
  content: "Hi! Tell me when you need time off — for example, \"4 days from today for a family wedding\".",
};

export function LeaveChat({ className }: { className?: string }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, proposal]);

  async function send(event: React.FormEvent) {
    event.preventDefault();

    const message = draft.trim();
    if (!message || busy) return;

    const next = [...turns, { role: "user" as const, content: message }];
    setTurns(next);
    setDraft("");
    // A new message supersedes any offer still on screen.
    setProposal(null);
    setBusy(true);

    try {
      const result = await apiClient.post<ChatReply>("/api/leaves/chat", { messages: next });

      setTurns((current) => [...current, { role: "assistant", content: result.reply }]);
      if (result.proposal) setProposal(result.proposal);
    } catch (error) {
      const text =
        error instanceof ApiClientError ? error.message : "Something went wrong. Please try again.";

      setTurns((current) => [...current, { role: "assistant", content: text }]);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!proposal || busy) return;

    setBusy(true);

    try {
      const result = await apiClient.post<ChatReply>("/api/leaves/chat/confirm", {
        startDate: proposal.startDate,
        days: proposal.days,
        reason: proposal.reason,
      });

      setProposal(null);
      setTurns((current) => [...current, { role: "assistant", content: result.reply }]);
      toast.success("Leave approved.");
      // Balance and recent-requests panels are server-rendered.
      router.refresh();
    } catch (error) {
      const text = error instanceof ApiClientError ? error.message : "That could not be booked.";

      setProposal(null);
      setTurns((current) => [...current, { role: "assistant", content: text }]);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }

  function decline() {
    setProposal(null);
    setTurns((current) => [
      ...current,
      { role: "assistant", content: "No problem — nothing booked. Tell me what you'd like instead." },
    ]);
  }

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-0">
        <div className="scrollbar-thin max-h-[22rem] min-h-[13rem] flex-1 space-y-4 overflow-y-auto px-4 pt-4">
          {turns.map((turn, index) => (
            <div
              key={index}
              className={cn("flex gap-2.5", turn.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              <div
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  turn.role === "user" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {turn.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </div>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-line",
                  turn.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted rounded-tl-sm",
                )}
              >
                {turn.content}
              </div>
            </div>
          ))}

          {busy && (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full [animation-delay:-0.3s]" />
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full [animation-delay:-0.15s]" />
              <span className="bg-muted-foreground size-1.5 animate-bounce rounded-full" />
            </div>
          )}

          <div ref={endRef} />
        </div>

        {proposal && (
          <div className="border-primary/30 bg-primary/5 mx-4 flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <span className="text-muted-foreground mr-auto text-xs">
              Nothing is booked until you confirm.
            </span>
            <Button size="sm" onClick={confirm} disabled={busy}>
              <Check className="size-4" />
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={decline} disabled={busy}>
              <X className="size-4" />
              Not now
            </Button>
          </div>
        )}

        <form onSubmit={send} className="bg-background/60 flex items-center gap-2 border-t p-3">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="I need 3 days off from Monday…"
            disabled={busy}
            maxLength={600}
            aria-label="Message the leave assistant"
          />
          <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
            <SendHorizontal className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
