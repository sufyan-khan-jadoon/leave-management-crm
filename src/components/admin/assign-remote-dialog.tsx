"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, House, Search, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiClientError, apiClient, toQueryString } from "@/lib/api-client";
import { MAX_REMOTE_WORK_REASON_LENGTH } from "@/lib/constants";
import { formatDate, toIsoDate, todayUtc } from "@/lib/date";
import { remoteTypeLabel, type RemoteWorkTypeValue } from "@/lib/remote-work";
import { initialsOf } from "@/lib/utils";
import type { EmployeeView, RemoteWorkTypeView, RemoteWorkView } from "@/types";

/**
 * The durations, in the order the brief lists them.
 *
 * Each carries what it *means* rather than only what it is called, because "One
 * week" is ambiguous about whether today counts and the answer decides somebody's
 * attendance for seven days. The dates themselves are still resolved on the
 * server against the company's calendar day — this text is the promise, and
 * `resolveRemotePeriod` is the thing that keeps it.
 */
const DURATIONS: Array<{ value: RemoteWorkTypeValue; hint: string }> = [
  { value: "TODAY", hint: "Today only" },
  { value: "TOMORROW", hint: "Tomorrow only" },
  { value: "WEEK", hint: "Seven days, starting today" },
  { value: "MONTH", hint: "One calendar month, starting today" },
  { value: "CUSTOM", hint: "Choose both dates" },
  { value: "UNTIL_REVOKED", hint: "No end date — permanent until revoked" },
];

type Step = "who" | "when" | "confirm";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reloads the table. Called only after a period was actually written. */
  onAssigned: () => void | Promise<void>;
  /** Pre-selected person, when the dialog is opened from somebody's profile. */
  presetEmployee?: { id: string; name: string; email: string } | null;
};

type Candidate = { id: string; name: string; email: string; department: string | null; profilePhoto: string | null };

/**
 * Assigning a remote-work period.
 *
 * **Three steps, and the third one is the point.** Putting somebody on remote
 * work takes them off the attendance register for as long as it runs — no
 * present, no absent, no warning letters — and an "until revoked" arrangement
 * does it indefinitely. That is not something to do from a form somebody tabs
 * through, so the last step states the person, the dates and the consequence in
 * words before anything is written. It is the same restraint the attendance
 * reset dialog shows, at a lower volume: this one is undoable, so it warns
 * rather than demanding a typed word.
 *
 * Nothing here computes a date for the fixed durations. The browser sends the
 * *type* and the server resolves it — a client whose clock is a day out would
 * otherwise book a week starting yesterday.
 */
export function AssignRemoteDialog({ open, onOpenChange, onAssigned, presetEmployee }: Props) {
  const [step, setStep] = useState<Step>(presetEmployee ? "when" : "who");
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [employee, setEmployee] = useState<Candidate | null>(null);

  const [type, setType] = useState<RemoteWorkTypeValue>("TODAY");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const today = toIsoDate(todayUtc());

  // Reset every time the dialog opens rather than on close: a dialog that
  // reopens holding the last person's details is how somebody assigns a period
  // to the wrong colleague.
  useEffect(() => {
    if (!open) return;

    setStep(presetEmployee ? "when" : "who");
    setEmployee(presetEmployee ? { ...presetEmployee, department: null, profilePhoto: null } : null);
    setSearch("");
    setCandidates([]);
    setType("TODAY");
    setStartDate("");
    setEndDate("");
    setReason("");
  }, [open, presetEmployee]);

  const findPeople = useCallback(async (term: string) => {
    setSearching(true);

    try {
      const result = await apiClient.get<{ items: EmployeeView[] }>(
        `/api/admin/employees${toQueryString({ search: term, status: "ACTIVE", pageSize: 8, sortBy: "name", sortDir: "asc" })}`,
      );

      setCandidates(
        result.items.map((item) => ({
          id: item.id,
          name: item.name,
          email: item.email,
          department: item.department,
          profilePhoto: item.profilePhoto,
        })),
      );
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't search for staff.");
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced, so typing a name is one request rather than one per keystroke.
  useEffect(() => {
    if (!open || step !== "who") return;

    const timer = setTimeout(() => void findPeople(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [open, step, search, findPeople]);

  /** What the period will read as, said the same way the server will say it. */
  function previewPeriod(): string {
    if (type === "UNTIL_REVOKED") return `${formatDate(todayUtc())} onwards, until revoked`;
    if (type === "CUSTOM") {
      if (!startDate || !endDate) return "—";
      return startDate === endDate
        ? formatDate(startDate)
        : `${formatDate(startDate)} – ${formatDate(endDate)}`;
    }

    // The fixed durations are resolved on the server, so this is a description
    // rather than a computed pair of dates — the hint the picker already showed,
    // repeated where the decision is made. The confirmation the server sends
    // back carries the real dates.
    return DURATIONS.find((duration) => duration.value === type)?.hint ?? "";
  }

  const readyForConfirm =
    employee !== null &&
    reason.trim().length >= 3 &&
    (type !== "CUSTOM" || (startDate !== "" && endDate !== "" && endDate >= startDate));

  async function submit() {
    if (!employee || !readyForConfirm || saving) return;

    setSaving(true);

    try {
      const result = await apiClient.post<{
        assignment: RemoteWorkView;
        emailSent: boolean;
        leaveDatesInPeriod: string[];
      }>("/api/admin/remote-work", {
        employeeId: employee.id,
        type,
        reason: reason.trim(),
        ...(type === "CUSTOM" ? { startDate, endDate } : {}),
      });

      toast.success(`${employee.name} is now remote — ${result.assignment.periodLabel}.`);

      // Reported rather than swallowed, exactly as the invitation panel reports
      // an undelivered link: the person has been exempted from attendance and
      // does not know it, and the administrator is the only one able to notice.
      if (!result.emailSent) {
        toast.warning(`${employee.name} could not be emailed about it. Tell them another way.`);
      }

      // Leave already booked inside the period stays booked and stays charged —
      // see `AssignRemoteWorkResult`. Said out loud because it is surprising:
      // somebody arranging a remote month would reasonably assume it swallowed
      // the two days off inside it, and it does not.
      if (result.leaveDatesInPeriod.length > 0) {
        toast.info(
          `${result.leaveDatesInPeriod.length} day${result.leaveDatesInPeriod.length === 1 ? "" : "s"} of approved leave fall inside this period. They stay booked and still cost ${employee.name} their allowance.`,
        );
      }

      onOpenChange(false);
      await onAssigned();
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : "Couldn't assign remote work.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <House className="text-primary-ink size-4" aria-hidden />
            Assign remote work
          </DialogTitle>
          <DialogDescription>
            {step === "who"
              ? "Choose who is working away from the office."
              : step === "when"
                ? "Choose how long for, and say why."
                : "Check this before it takes effect."}
          </DialogDescription>
        </DialogHeader>

        {step === "who" && (
          <div className="space-y-3">
            <div className="relative">
              <Search
                className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email or department"
                className="pl-9"
                aria-label="Search staff"
              />
            </div>

            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEmployee(candidate);
                      setStep("when");
                    }}
                    className="border-border/60 hover:bg-accent/40 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors"
                  >
                    <Avatar className="size-8">
                      {candidate.profilePhoto && <AvatarImage src={candidate.profilePhoto} alt="" />}
                      <AvatarFallback>{initialsOf(candidate.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{candidate.name}</p>
                      {/*
                        The address, always — two people can share a name, a
                        department and a job title, and the buttons would then
                        render identical text twice. The same reasoning the
                        workforce assistant's disambiguation records.
                      */}
                      <p className="text-muted-foreground truncate text-xs">{candidate.email}</p>
                    </div>
                  </button>
                </li>
              ))}

              {!searching && candidates.length === 0 && (
                <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                  {search.trim() ? "Nobody matches that." : "Start typing to find someone."}
                </li>
              )}
            </ul>
          </div>
        )}

        {step === "when" && employee && (
          <div className="space-y-4">
            <div className="glass-inset flex items-center gap-3 rounded-xl p-3">
              <UserRound className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{employee.name}</p>
                <p className="text-muted-foreground truncate text-xs">{employee.email}</p>
              </div>
              {!presetEmployee && (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setStep("who")}>
                  Change
                </Button>
              )}
            </div>

            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">How long for?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {DURATIONS.map((duration) => (
                  <button
                    key={duration.value}
                    type="button"
                    onClick={() => setType(duration.value)}
                    aria-pressed={type === duration.value}
                    className={
                      type === duration.value
                        ? "border-primary bg-primary/10 flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors"
                        : "border-border/60 hover:bg-accent/40 flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors"
                    }
                  >
                    <span className="text-sm font-medium">{remoteTypeLabel(duration.value)}</span>
                    <span className="text-muted-foreground text-xs">{duration.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {type === "CUSTOM" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="remote-start">Start date</Label>
                  <Input
                    id="remote-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="remote-end">End date</Label>
                  <Input
                    id="remote-end"
                    type="date"
                    value={endDate}
                    // Only bounded against the start it must not precede. A
                    // backdated range is deliberately allowed — "she was working
                    // from home all last week" is a correction somebody has to be
                    // able to make, and it is the counterpart of recording an
                    // attendance day by hand. The server refuses an end before a
                    // start regardless of what this attribute says.
                    min={startDate || undefined}
                    onChange={(event) => setEndDate(event.target.value)}
                  />
                </div>
                {startDate && endDate && endDate < startDate && (
                  <p className="text-destructive-ink text-xs sm:col-span-2">
                    The end date cannot be before the start date.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="remote-reason">Reason</Label>
              <Textarea
                id="remote-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={MAX_REMOTE_WORK_REASON_LENGTH}
                rows={3}
                placeholder="Working from home while the office is being refitted"
              />
              <p className="text-muted-foreground text-xs">
                Kept on the record and included in the email. Required — an exemption from attendance
                with nothing said about it is one somebody has to reconstruct later.
              </p>
            </div>
          </div>
        )}

        {step === "confirm" && employee && (
          <div className="space-y-3">
            <dl className="border-border/60 divide-border/60 divide-y rounded-xl border">
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground text-sm">Employee</dt>
                <dd className="text-right text-sm font-medium">{employee.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground text-sm">Remote</dt>
                <dd className="text-right text-sm font-medium">{previewPeriod()}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground text-sm">Type</dt>
                <dd className="text-right text-sm font-medium">
                  <Badge variant="warning">{remoteTypeLabel(type)}</Badge>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <dt className="text-muted-foreground text-sm">Reason</dt>
                <dd className="max-w-[60%] text-right text-sm">{reason.trim()}</dd>
              </div>
            </dl>

            <div className="glass-inset text-muted-foreground flex items-start gap-2 rounded-xl p-3 text-sm">
              <House className="text-warning-ink mt-0.5 size-4 shrink-0" aria-hidden />
              <p>
                <span className="text-foreground font-medium">
                  Attendance will be excluded for this period.
                </span>{" "}
                {employee.name} will not be marked present or absent, will not appear in absence
                figures, and will receive no attendance reminders.{" "}
                {type === "UNTIL_REVOKED"
                  ? "This has no end date and continues until somebody revokes it."
                  : "Normal attendance resumes the day after it ends."}{" "}
                They will be emailed about it.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {step === "confirm" ? (
            <>
              <Button variant="outline" onClick={() => setStep("when")} disabled={saving}>
                <ArrowLeft className="size-4" />
                Back
              </Button>
              <Button onClick={() => void submit()} loading={saving}>
                <Check className="size-4" />
                Confirm remote work
              </Button>
            </>
          ) : step === "when" ? (
            <Button onClick={() => setStep("confirm")} disabled={!readyForConfirm}>
              Review
            </Button>
          ) : null}
        </DialogFooter>

        {/* The dates for a fixed duration are the server's to decide, and it
            says so rather than showing a computed pair that could disagree with
            what actually gets written. */}
        {step === "confirm" && type !== "CUSTOM" && type !== "UNTIL_REVOKED" && (
          <p className="text-muted-foreground -mt-2 text-xs">
            The exact dates are worked out on the office&apos;s calendar (today is {formatDate(today)}) and
            confirmed once saved.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { RemoteWorkTypeView };
