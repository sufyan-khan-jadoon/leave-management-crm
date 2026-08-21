"use client";

import { useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { AttendanceStatusBadge, DAY_STATUS_BADGE } from "@/components/shared/attendance-status-badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { EDITABLE_DAY_STATUSES, isEditableDayStatus } from "@/lib/attendance-edit";
import { formatDate } from "@/lib/date";
import { dayStatusLabel } from "@/lib/report-labels";
import type { AttendanceDayStatus } from "@/types";

/**
 * The status, and — for a finished day an authorised administrator is looking
 * at — a way to change it in one click.
 *
 * **The badge itself is the control.** No pencil beside it, no row menu, no
 * dialog asking why: clicking the status opens the three it can become and
 * choosing one writes it. That is the whole interaction, and everything about
 * this component follows from keeping it that short.
 *
 * It renders the plain `AttendanceStatusBadge` whenever it cannot be used, which
 * is most of the time — the wrong day, the wrong status, the wrong permission —
 * so the roster reads identically to how it always has and the editable case is
 * the exception rather than a redesign. Hiding the control is a **courtesy**:
 * `editHistoricalDay` re-derives the day, re-reads the grant from the row and
 * refuses today's date regardless of what was drawn here.
 */
export function AttendanceStatusEditor({
  status,
  employeeId,
  employeeName,
  date,
  /** The grant, resolved on the server. Never worked out in the browser. */
  canEdit,
  /** Whether the date on screen has finished. Also decided on the server. */
  isHistorical,
  onChanged,
}: {
  status: AttendanceDayStatus;
  employeeId: string;
  employeeName: string;
  date: string;
  canEdit: boolean;
  isHistorical: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  // Three conditions, all of which the server checks again. The status one is
  // what keeps a closure, a weekend, a remote day, the future and an unwatched
  // day out of reach — those belong to the calendar rather than to the person,
  // and `EDITABLE_DAY_STATUSES` is the single list saying so.
  const editable = canEdit && isHistorical && isEditableDayStatus(status);

  if (!editable) return <AttendanceStatusBadge status={status} />;

  async function choose(next: (typeof EDITABLE_DAY_STATUSES)[number]) {
    if (next === status || saving) return;
    setSaving(true);

    try {
      const result = await apiClient.post<{ status: AttendanceDayStatus }>(
        "/api/admin/attendance/edit",
        { employeeId, date, status: next },
      );

      // The server's word for what the day reads as now, not the button that was
      // pressed. They agree in every ordinary case and diverge exactly when some
      // other fact moved underneath the request — a closure declared while the
      // menu was open — where the truth is the more useful of the two.
      toast.success(
        `${employeeName} — ${formatDate(date)} is now ${dayStatusLabel(result.status).toLowerCase()}.`,
      );

      // Re-fetched rather than patched in place, so the badge, the tiles above it
      // and the totals all come from the server that just decided them.
      await onChanged();
    } catch (error) {
      // Nothing was written, and the badge still shows whatever the last fetch
      // said. The message is the service's own — it names the rule that refused,
      // which is the only way somebody learns why a weekend has no editor.
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : "Couldn't change that status. It is unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={saving}
        aria-label={`Change ${employeeName}'s status on ${formatDate(date)}, currently ${dayStatusLabel(status)}`}
        // Styled as an affordance rather than a button so the table keeps its
        // shape: the badge is unchanged and the chevron is what says it can be
        // pressed. `rounded-full` matches the badge it wraps.
        className="focus-visible:ring-ring/50 inline-flex cursor-pointer items-center gap-1 rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <AttendanceStatusBadge status={status} />
        {saving ? (
          <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-hidden />
        ) : (
          <ChevronDown className="text-muted-foreground size-3.5" aria-hidden />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {formatDate(date)}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {EDITABLE_DAY_STATUSES.map((option) => {
          const { Icon } = DAY_STATUS_BADGE[option];
          const current = option === status;

          return (
            <DropdownMenuItem
              key={option}
              onSelect={() => choose(option)}
              // The status a day already holds is left selectable-looking but
              // inert, marked with a tick. Removing it would make the menu
              // change length depending on where the day stands, which reads as
              // a different menu rather than the same one.
              disabled={current}
              className="gap-2"
            >
              <Icon className="size-4" aria-hidden />
              {dayStatusLabel(option)}
              {current && <Check className="text-primary-ink ml-auto size-4" aria-hidden />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
