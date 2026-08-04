"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { AlertTriangle, CalendarCheck, CheckCircle2, PhoneCall, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { MONTHLY_LEAVE_ALLOWANCE, ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { aiLeaveRequestSchema, type AiLeaveRequestInput } from "@/validations/leave.schema";
import type { LeaveDecisionResult } from "@/types";

const EXAMPLES = [
  "I need leave tomorrow because I have a doctor's appointment.",
  "I need leave on Friday because I have university exams.",
  "Taking next Monday off — my sister's wedding.",
  "I won't be able to come in on the 20th, I have a visa interview.",
] as const;

type AiLeaveFormProps = {
  remainingThisMonth: number;
  hrPhone: string;
};

export function AiLeaveForm({ remainingThisMonth, hrPhone }: AiLeaveFormProps) {
  const router = useRouter();
  const [result, setResult] = useState<LeaveDecisionResult | null>(null);

  const form = useForm<AiLeaveRequestInput>({
    resolver: zodResolver(aiLeaveRequestSchema),
    defaultValues: { message: "" },
  });

  const message = form.watch("message");

  async function onSubmit(values: AiLeaveRequestInput) {
    setResult(null);

    try {
      const decision = await apiClient.post<LeaveDecisionResult>("/api/leaves/ai", values);

      setResult(decision);
      form.reset({ message: "" });

      if (decision.approved) toast.success("Leave approved.");
      else toast.warning("Request could not be approved.");

      router.refresh();
    } catch (error) {
      const messageText =
        error instanceof ApiClientError ? error.message : "Something went wrong. Please try again.";

      form.setError("message", { message: messageText });
      toast.error(messageText);
    }
  }

  const submitting = form.formState.isSubmitting;

  return (
    <div className="space-y-4">
      <Card glass>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="bg-primary/12 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <div className="space-y-0.5">
              <p className="font-semibold">Describe your leave</p>
              <p className="text-muted-foreground text-sm">
                Write it however feels natural. Our assistant pulls out the date and reason for you.
              </p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3" noValidate>
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        rows={4}
                        placeholder="e.g. I need leave on Friday because I have university exams."
                        disabled={submitting}
                        className="resize-none text-base"
                        {...field}
                      />
                    </FormControl>
                    <div className="flex items-center justify-between gap-3">
                      <FormMessage />
                      <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                        {message.length}/600
                      </span>
                    </div>
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-muted-foreground text-xs">
                  Your message is analysed and discarded — only the extracted date and reason are stored.
                </p>
                <Button type="submit" loading={submitting} disabled={message.trim().length < 10}>
                  {!submitting && <Sparkles className="size-4" />}
                  {submitting ? "Reading your request…" : "Submit request"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {!result && (
        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm font-medium">Try one of these</p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  disabled={submitting}
                  onClick={() => form.setValue("message", example, { shouldValidate: true })}
                  className="border-border hover:bg-accent hover:text-accent-foreground rounded-full border px-3 py-1.5 text-left text-xs transition-colors disabled:opacity-50"
                >
                  {example}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {result && <DecisionCard result={result} hrPhone={hrPhone} />}

      {remainingThisMonth === 0 && !result && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="flex items-start gap-3">
            <AlertTriangle className="text-warning mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="space-y-1 text-sm">
              <p className="font-medium">You&apos;ve used all {MONTHLY_LEAVE_ALLOWANCE} leaves this month</p>
              <p className="text-muted-foreground">
                New requests for this month will be declined automatically. Contact HR if you need an
                exception.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Shows exactly what the AI extracted and how the policy was applied. */
function DecisionCard({ result, hrPhone }: { result: LeaveDecisionResult; hrPhone: string }) {
  const { approved, leave, message, remainingThisMonth } = result;

  return (
    <Card
      className={cn(
        "overflow-hidden",
        approved ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
      )}
    >
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          {approved ? (
            <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden />
          ) : (
            <XCircle className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden />
          )}
          <div className="space-y-1">
            <p className="font-semibold">{approved ? "Leave approved" : "Request declined"}</p>
            <p className="text-muted-foreground text-sm">{message}</p>
          </div>
        </div>

        <dl className="bg-background/60 grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
          <div className="space-y-0.5">
            <dt className="text-muted-foreground text-xs font-medium">Extracted date</dt>
            <dd className="flex items-center gap-1.5 font-medium">
              <CalendarCheck className="text-muted-foreground size-4" aria-hidden />
              {formatDate(leave.leaveDate)}
            </dd>
          </div>
          <div className="space-y-0.5">
            <dt className="text-muted-foreground text-xs font-medium">Extracted reason</dt>
            <dd className="font-medium">{leave.reason}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={ROUTES.leaves}>View leave history</Link>
          </Button>

          {!approved && (
            <Button variant="ghost" size="sm" asChild>
              <a href={`tel:${hrPhone.replace(/[^\d+]/g, "")}`}>
                <PhoneCall className="size-4" />
                Call HR
              </a>
            </Button>
          )}

          {approved && (
            <span className="text-muted-foreground text-xs">
              {remainingThisMonth} of {MONTHLY_LEAVE_ALLOWANCE} remaining this month
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
