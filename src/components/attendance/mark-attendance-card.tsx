"use client";

import { useState } from "react";
import { CalendarOff, CheckCircle2, Clock, House, LocateFixed, MapPin } from "lucide-react";
import { toast } from "sonner";

import { AttendanceStatusBadge } from "@/components/shared/attendance-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ALLOWED_RADIUS_METERS } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import { GEOLOCATION_MESSAGES, requestPosition } from "@/lib/geolocation";
import { describeLateness } from "@/lib/lateness";
import type { AttendanceTodayView, AttendanceView } from "@/types";

/** What the button is doing, and what it says while doing it. */
type Phase = "idle" | "locating" | "verifying";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Mark present",
  locating: "Verifying your location…",
  verifying: "Verifying your location…",
};

type Props = {
  today: AttendanceTodayView;
  onMarked: () => void | Promise<void>;
};

/**
 * Marking yourself present. The only place it happens.
 *
 * The browser's only job is to produce three numbers and hand them over — it
 * never decides, or claims to know, whether the employee is at the office. Every
 * message below reports something the *server* concluded, which is why a
 * refusal arrives as an API error rather than as a branch taken here.
 *
 * Takes `today` already resolved rather than fetching it: the dashboard carries
 * it in the payload it was loading anyway, and owns the loading and error states
 * around it, so there is nothing for this card to do but render and act.
 */
export function MarkAttendanceCard({ today, onMarked }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [verified, setVerified] = useState<{ distanceMeters: number | null } | null>(null);

  async function markPresent() {
    if (phase !== "idle") return;

    setPhase("locating");
    setVerified(null);

    const outcome = await requestPosition();

    if (!outcome.ok) {
      setPhase("idle");
      toast.error(GEOLOCATION_MESSAGES[outcome.failure]);
      return;
    }

    setPhase("verifying");

    try {
      const result = await apiClient.post<{ attendance: AttendanceView; alreadyMarked: boolean }>(
        "/api/attendance",
        // Coordinates only. The server computes the distance itself and would
        // reject a body carrying a verdict of our own.
        {
          latitude: outcome.reading.latitude,
          longitude: outcome.reading.longitude,
          accuracyMeters: outcome.reading.accuracyMeters,
        },
      );

      // Non-null in practice — `/api/attendance` only ever writes a geofenced
      // row — but the column is nullable because an administrator may record a
      // day by hand, and a `?? null` here is cheaper than an assertion that
      // would be wrong the day this card is reused for anything else.
      setVerified({ distanceMeters: result.attendance.distanceMeters ?? null });

      toast.success(
        result.alreadyMarked
          ? "You were already marked present today."
          : `Location verified ✓ — you're marked present at ${formatDateTime(result.attendance.checkInAt)}.`,
      );

      await onMarked();
    } catch (caught) {
      toast.error(
        caught instanceof ApiClientError ? caught.message : "Couldn't mark attendance. Please try again.",
      );
    } finally {
      setPhase("idle");
    }
  }

  const { attendance } = today;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="text-primary-ink size-4" aria-hidden />
          Today
        </CardTitle>
        <CardDescription>
          {formatDate(today.date)} — attendance can only be marked from inside the office, within{" "}
          {ALLOWED_RADIUS_METERS} metres.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <AttendanceStatusBadge status={today.status} />

          {attendance && (
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Clock className="size-3.5" aria-hidden />
              Checked in at {formatDateTime(attendance.checkInAt)}
              {attendance.lateMinutes > 0 && (
                <span className="text-warning-ink font-medium">
                  · {describeLateness(attendance.lateMinutes)}
                </span>
              )}
            </span>
          )}
        </div>

        {attendance ? (
          <div className="glass-inset space-y-1.5 rounded-xl p-4 text-sm">
            {/*
              "Location verified" is a claim about a measurement, so it is only
              said when there was one. A day an administrator recorded by hand
              has no position behind it, and printing the verified wording over
              it would be the card asserting something the server never checked.
            */}
            {attendance.distanceMeters !== null && attendance.accuracyMeters !== null ? (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="text-success-ink size-4" aria-hidden />
                  Location verified ✓
                </p>
                <p className="text-muted-foreground">
                  You were {formatDistance(attendance.distanceMeters)} from the office when you checked in, on
                  a fix accurate to {formatDistance(attendance.accuracyMeters)}.
                </p>
              </>
            ) : (
              <>
                <p className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="text-success-ink size-4" aria-hidden />
                  Recorded by {attendance.markedBy?.name ?? "an administrator"}
                </p>
                <p className="text-muted-foreground">
                  You are marked present for today. This was recorded without the location check
                  {attendance.reason ? `: ${attendance.reason}` : "."}
                </p>
              </>
            )}
          </div>
        ) : today.remote ? (
          /*
            §16's employee view: remote is stated as an arrangement, with the
            period and the one consequence that matters — nothing is required of
            them today.

            The button stays, below the notice rather than instead of it, and
            that is deliberate. Remote decides who is *expected*, not who is
            *permitted*: somebody who comes into the office anyway can prove it
            with the geofence like anybody else, and hiding the control would
            have the screen refusing a fact the server would happily accept.
            What changes is the framing — an optional action under an
            explanation, rather than a bare button implying a duty.
          */
          <div className="space-y-3">
            <div className="glass-inset space-y-1.5 rounded-xl p-4 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <House className="text-warning-ink size-4" aria-hidden />
                {today.remote.permanent ? "Remote — until revoked" : `Remote · ${today.remote.periodLabel}`}
              </p>
              <p className="text-muted-foreground">
                {today.remote.permanent
                  ? "Attendance tracking is switched off for you until an administrator revokes this. "
                  : "Attendance is not required for this period. "}
                These days are not counted as present, absent or leave, and they cost you nothing from
                your leave allowance.
              </p>
              <p className="text-muted-foreground text-xs">Reason on record: {today.remote.reason}</p>
            </div>

            {today.canMark ? (
              <>
                <Button
                  onClick={() => void markPresent()}
                  loading={phase !== "idle"}
                  variant="outline"
                  size="lg"
                >
                  {phase === "idle" && <LocateFixed className="size-4" />}
                  {phase === "idle" ? "Came in anyway? Mark present" : PHASE_LABEL[phase]}
                </Button>

                <p className="text-muted-foreground text-xs">
                  Optional. If you are at the office you can still record the day; nobody is chased for
                  skipping it.
                </p>
              </>
            ) : (
              /*
                A remote period is an arrangement about a person; a day off is a
                fact about the calendar, and it outranks the arrangement. Without
                this the optional button simply vanished on a day off while the
                panel above went on describing the remote period — somebody
                looking at a control that had disappeared, with nothing saying
                why, which is the silence this whole change exists to remove.
              */
              today.blockedReason && (
                <p className="text-muted-foreground flex items-start gap-2 text-xs">
                  <CalendarOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {today.blockedReason}
                </p>
              )
            )}
          </div>
        ) : today.canMark ? (
          <div className="space-y-3">
            <Button onClick={() => void markPresent()} loading={phase !== "idle"} size="lg">
              {phase === "idle" && <LocateFixed className="size-4" />}
              {PHASE_LABEL[phase]}
            </Button>

            {verified?.distanceMeters !== null && verified !== null && (
              <p className="text-muted-foreground text-sm">
                Location verified ✓ — {formatDistance(verified.distanceMeters)} from the office.
              </p>
            )}

            <p className="text-muted-foreground text-xs">
              Your browser will ask to share your location. It is checked against the office by the server and
              stored with the record.
            </p>
          </div>
        ) : (
          <div className="glass-inset text-muted-foreground flex items-start gap-2 rounded-xl p-4 text-sm">
            <CalendarOff className="mt-0.5 size-4 shrink-0" aria-hidden />
            {today.blockedReason}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
