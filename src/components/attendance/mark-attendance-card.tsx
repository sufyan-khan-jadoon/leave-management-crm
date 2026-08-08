"use client";

import { useState } from "react";
import { CalendarOff, CheckCircle2, Clock, LocateFixed, MapPin, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AttendanceStatusBadge } from "@/components/shared/attendance-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ALLOWED_RADIUS_METERS } from "@/lib/constants";
import { formatDateTime } from "@/lib/date";
import { formatDistance } from "@/lib/geo";
import { GEOLOCATION_MESSAGES, requestPosition } from "@/lib/geolocation";
import type { AttendanceTodayView, AttendanceView } from "@/types";

/** What the button is doing, and what it says while doing it. */
type Phase = "idle" | "locating" | "verifying";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "Mark present",
  locating: "Verifying your location…",
  verifying: "Verifying your location…",
};

type Props = {
  today: AttendanceTodayView | null;
  loading: boolean;
  error: string | null;
  onMarked: () => void | Promise<void>;
};

/**
 * The one action of the attendance screen.
 *
 * The browser's only job is to produce three numbers and hand them over — it
 * never decides, or claims to know, whether the employee is at the office. Every
 * message below reports something the *server* concluded, which is why a
 * refusal arrives as an API error rather than as a branch taken here.
 */
export function MarkAttendanceCard({ today, loading, error, onMarked }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [verified, setVerified] = useState<{ distanceMeters: number } | null>(null);

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

      setVerified({ distanceMeters: result.attendance.distanceMeters });

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

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-10 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (error || !today) {
    return (
      <Card>
        <CardContent className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
          <TriangleAlert className="text-warning-ink size-4" aria-hidden />
          {error ?? "Couldn't load today's attendance."}
        </CardContent>
      </Card>
    );
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
          {formatDateTime(today.date).split(",").slice(0, 2).join(",")} — attendance can only be marked from
          inside the office, within {ALLOWED_RADIUS_METERS} metres.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <AttendanceStatusBadge status={today.status} />

          {attendance && (
            <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <Clock className="size-3.5" aria-hidden />
              Checked in at {formatDateTime(attendance.checkInAt)}
            </span>
          )}
        </div>

        {attendance ? (
          <div className="glass-inset space-y-1.5 rounded-xl p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="text-success-ink size-4" aria-hidden />
              Location verified ✓
            </p>
            <p className="text-muted-foreground">
              You were {formatDistance(attendance.distanceMeters)} from the office when you checked in, on a
              fix accurate to {formatDistance(attendance.accuracyMeters)}.
            </p>
          </div>
        ) : today.canMark ? (
          <div className="space-y-3">
            <Button onClick={() => void markPresent()} loading={phase !== "idle"} size="lg">
              {phase === "idle" && <LocateFixed className="size-4" />}
              {PHASE_LABEL[phase]}
            </Button>

            {verified && (
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
