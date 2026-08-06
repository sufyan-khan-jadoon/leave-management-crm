"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AudioLines,
  Bot,
  Check,
  Mic,
  MicOff,
  PhoneOff,
  SendHorizontal,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSpeech } from "@/hooks/use-speech";
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

/**
 * Spoken answers to a pending proposal are matched here rather than sent to the
 * model: booking leave is consequential, and a deterministic yes/no is more
 * predictable than asking a small model to classify agreement.
 */
const AFFIRMATIVE = /\b(yes|yeah|yep|yup|sure|ok|okay|confirm|book it|go ahead|do it|please do)\b/i;
const NEGATIVE = /\b(no|nope|cancel|don'?t|do not|not now|stop|never mind|nevermind)\b/i;

/**
 * `bare` drops the surrounding card so the chat can be embedded in a panel that
 * already provides one — nesting two glass surfaces muddies both.
 */
export function LeaveChat({ className, bare = false }: { className?: string; bare?: boolean }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Async speech callbacks fire long after the render that scheduled them, so
  // anything they branch on is mirrored into a ref.
  const voiceModeRef = useRef(false);
  const proposalRef = useRef<Proposal | null>(null);
  const busyRef = useRef(false);

  voiceModeRef.current = voiceMode;
  proposalRef.current = proposal;
  busyRef.current = busy;

  const turnsRef = useRef<Turn[]>(turns);
  turnsRef.current = turns;

  const handleRef = useRef<(text: string, final: boolean) => void>(() => {});
  const speech = useSpeech({
    onTranscript: useCallback((text: string, final: boolean) => handleRef.current(text, final), []),
  });

  const { canListen, canSpeak, listening, speaking, speak, startListening, stopListening, stopSpeaking } =
    speech;

  /** Adds a reply, reads it aloud when asked, and resumes listening in voice mode. */
  const addReply = useCallback(
    (content: string) => {
      setTurns((current) => [...current, { role: "assistant", content }]);

      const inVoice = voiceModeRef.current;
      if (!canSpeak || (!readAloud && !inVoice)) return;

      speak(content, () => {
        // Hand the turn back to the employee, unless they left voice mode while
        // the assistant was still talking.
        if (voiceModeRef.current) startListening();
      });
    },
    [canSpeak, readAloud, speak, startListening],
  );

  const exchange = useCallback(
    async (message: string) => {
      const next = [...turnsRef.current, { role: "user" as const, content: message }];
      setTurns(next);
      setDraft("");
      // A new message supersedes any offer still on screen.
      setProposal(null);
      setBusy(true);

      try {
        const result = await apiClient.post<ChatReply>("/api/leaves/chat", { messages: next });

        addReply(result.reply);
        if (result.proposal) setProposal(result.proposal);
      } catch (error) {
        const text =
          error instanceof ApiClientError ? error.message : "Something went wrong. Please try again.";

        addReply(text);
        toast.error(text);
      } finally {
        setBusy(false);
      }
    },
    [addReply],
  );

  const confirmProposal = useCallback(async () => {
    const pending = proposalRef.current;
    if (!pending || busyRef.current) return;

    setBusy(true);

    try {
      const result = await apiClient.post<ChatReply>("/api/leaves/chat/confirm", {
        startDate: pending.startDate,
        days: pending.days,
        reason: pending.reason,
      });

      setProposal(null);
      addReply(result.reply);
      toast.success("Leave approved.");
      // Balance and recent-requests panels are server-rendered.
      router.refresh();
    } catch (error) {
      const text = error instanceof ApiClientError ? error.message : "That could not be booked.";

      setProposal(null);
      addReply(text);
      toast.error(text);
    } finally {
      setBusy(false);
    }
  }, [addReply, router]);

  const declineProposal = useCallback(() => {
    setProposal(null);
    addReply("No problem — nothing booked. Tell me what you'd like instead.");
  }, [addReply]);

  // Wired through a ref so the recognition instance never has to be rebuilt.
  handleRef.current = (text, final) => {
    setDraft(text);
    if (!final || !voiceModeRef.current) return;

    const spoken = text.trim();
    if (!spoken) {
      startListening();
      return;
    }

    stopListening();
    setDraft("");

    // While an offer is open, a plain yes or no answers it directly.
    if (proposalRef.current) {
      if (AFFIRMATIVE.test(spoken)) {
        setTurns((current) => [...current, { role: "user", content: spoken }]);
        void confirmProposal();
        return;
      }

      if (NEGATIVE.test(spoken)) {
        setTurns((current) => [...current, { role: "user", content: spoken }]);
        declineProposal();
        return;
      }
    }

    void exchange(spoken);
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, proposal]);

  // Turning read-aloud off should silence what is mid-sentence, not just what
  // comes next. Voice mode does its own speaking, so leave it alone there.
  useEffect(() => {
    if (!readAloud && !voiceMode) stopSpeaking();
  }, [readAloud, voiceMode, stopSpeaking]);

  function startVoiceMode() {
    setVoiceMode(true);
    voiceModeRef.current = true;
    setDraft("");
    startListening();
  }

  function endVoiceMode() {
    setVoiceMode(false);
    voiceModeRef.current = false;
    stopListening();
    stopSpeaking();
    setDraft("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();

    const message = draft.trim();
    if (!message || busy) return;

    if (listening) stopListening();
    await exchange(message);
  }

  const status = busy ? "Thinking…" : speaking ? "Speaking…" : listening ? "Listening…" : "Paused";

  const body = (
    <>
        {canSpeak && !voiceMode && (
          <div className="border-border/60 flex items-center gap-2 border-b px-4 py-2">
            <span className="text-muted-foreground mr-auto text-xs">
              {speaking ? "Speaking…" : readAloud ? "Replies read aloud" : "Replies are text only"}
            </span>

            {speaking && (
              <Button variant="ghost" size="sm" onClick={stopSpeaking}>
                Stop
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReadAloud((on) => !on)}
              aria-pressed={readAloud}
              aria-label={readAloud ? "Turn off spoken replies" : "Turn on spoken replies"}
            >
              {readAloud ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              {readAloud ? "Read aloud" : "Silent"}
            </Button>
          </div>
        )}

        <div className="scrollbar-thin max-h-[22rem] min-h-[13rem] flex-1 space-y-4 overflow-y-auto px-4 pt-4">
          {turns.map((turn, index) => (
            <div
              key={index}
              className={cn("flex gap-2.5", turn.role === "user" ? "flex-row-reverse" : "flex-row")}
            >
              <div
                className={cn(
                  "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                  turn.role === "user" ? "bg-primary/10 text-primary-ink" : "bg-muted text-muted-foreground",
                )}
                aria-hidden
              >
                {turn.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </div>
              <div
                className={cn(
                  "animate-in fade-in-0 zoom-in-95 max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-line duration-300 ease-spring",
                  turn.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm shadow-[inset_0_1px_0_0_oklch(1_0_0/20%),0_4px_12px_-6px_color-mix(in_oklab,var(--primary)_60%,transparent)]"
                    : "glass-subtle rounded-tl-sm",
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
          <div className="bg-primary/6 animate-in fade-in-0 slide-in-from-bottom-1 mx-4 flex flex-wrap items-center gap-2 rounded-lg p-3 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_25%,transparent)] duration-300 ease-spring">
            <span className="text-muted-foreground mr-auto text-xs">
              {voiceMode ? 'Say "yes" to book it, or "no" to cancel.' : "Nothing is booked until you confirm."}
            </span>
            <Button size="sm" onClick={confirmProposal} disabled={busy}>
              <Check className="size-4" />
              Confirm
            </Button>
            <Button size="sm" variant="ghost" onClick={declineProposal} disabled={busy}>
              <X className="size-4" />
              Not now
            </Button>
          </div>
        )}

        {voiceMode ? (
          <div className="border-border/60 glass-subtle flex items-center gap-3 border-t p-4">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
                listening
                  ? "bg-primary/15 text-primary-ink animate-pulse"
                  : speaking
                    ? "bg-success/15 text-success-ink"
                    : "bg-muted text-muted-foreground",
              )}
              aria-hidden
            >
              <AudioLines className="size-5" />
            </span>

            <div className="mr-auto min-w-0">
              <p className="text-sm font-medium">{status}</p>
              <p className="text-muted-foreground truncate text-xs">
                {draft.trim() || "Just talk — I'll reply out loud."}
              </p>
            </div>

            {!listening && !speaking && !busy && (
              <Button variant="outline" size="sm" onClick={startListening}>
                <Mic className="size-4" />
                Resume
              </Button>
            )}

            <Button variant="destructive" size="sm" onClick={endVoiceMode}>
              <PhoneOff className="size-4" />
              End
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="border-border/60 glass-subtle flex items-center gap-2 border-t p-3">
            {canListen && (
              <Button
                type="button"
                size="icon"
                variant={listening ? "default" : "outline"}
                onClick={() => (listening ? stopListening() : startListening())}
                disabled={busy}
                aria-pressed={listening}
                aria-label={listening ? "Stop dictating" : "Dictate your message"}
                className={cn(listening && "animate-pulse")}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}

            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={listening ? "Listening…" : "I need 3 days off from Monday…"}
              disabled={busy}
              maxLength={600}
              aria-label="Message the leave assistant"
            />

            <Button type="submit" size="icon" disabled={busy || !draft.trim()} aria-label="Send">
              <SendHorizontal className="size-4" />
            </Button>

            {canListen && canSpeak && (
              <Button type="button" variant="outline" size="sm" onClick={startVoiceMode} disabled={busy}>
                <AudioLines className="size-4" />
                Voice
              </Button>
            )}
          </form>
        )}
    </>
  );

  if (bare) {
    return <div className={cn("flex min-h-0 flex-1 flex-col gap-4", className)}>{body}</div>;
  }

  return (
    <Card className={cn("flex flex-col overflow-hidden", className)}>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-0">{body}</CardContent>
    </Card>
  );
}
