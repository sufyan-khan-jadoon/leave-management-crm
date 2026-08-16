"use client";

import { useMemo, useState } from "react";
import { Check, Search, ShieldCheck, X } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** As the recipient endpoint returns them. No address — see the service. */
export type AdminRecipient = {
  id: string;
  name: string;
  role: string;
  department: string | null;
};

/**
 * Choosing which administrators a message goes to.
 *
 * The list is **filtered here rather than on the server**, which is the opposite
 * of `ReportPeoplePicker` and deliberate. That endpoint is capped, so a
 * client-side filter would search the first page of an organisation and report
 * that nobody else exists; this one returns the administrators, a population
 * bounded by how many people run the company. Filtering the list already in hand
 * buys the thing that matters more here: the same fetch backs both the picker
 * and the "all administrators" count beside it, so the two can never disagree
 * about who is eligible.
 *
 * Selections **survive a change of search term** — the chips are the state and
 * the list is only a way of reaching it — and every selection is shown as a chip
 * whether or not the current search would still turn it up. Somebody who picks
 * four people, types a name, and sends must not discover afterwards that the
 * three they could no longer see went too, or did not.
 */
export function AdminRecipientPicker({
  candidates,
  selected,
  onChange,
  disabled = false,
  loading = false,
}: {
  candidates: AdminRecipient[];
  /** Kept whole rather than as ids, so a chip can name somebody the search hides. */
  selected: AdminRecipient[];
  onChange: (people: AdminRecipient[]) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const [search, setSearch] = useState("");

  const selectedIds = useMemo(() => new Set(selected.map((person) => person.id)), [selected]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return candidates;

    return candidates.filter(
      (person) =>
        person.name.toLowerCase().includes(term) ||
        (person.department ?? "").toLowerCase().includes(term),
    );
  }, [candidates, search]);

  function toggle(person: AdminRecipient) {
    if (disabled) return;

    onChange(
      selectedIds.has(person.id)
        ? selected.filter((chosen) => chosen.id !== person.id)
        : [...selected, person],
    );
  }

  // Adds what the search is currently showing rather than the whole roster, so
  // the button does what the screen says it will. Somebody who wants everybody
  // has an audience for that and does not need to reach it by a side door.
  function selectVisible() {
    const additions = visible.filter((person) => !selectedIds.has(person.id));
    onChange([...selected, ...additions]);
  }

  return (
    <div className="border-border/60 bg-muted/20 space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="admin-recipient-search" className="text-sm font-medium">
          Choose administrators
        </Label>

        <div className="flex items-center gap-2">
          <Badge variant={selected.length > 0 ? "success" : "outline"} className="tabular-nums">
            {selected.length} selected
          </Badge>

          {visible.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={selectVisible}
              disabled={disabled || visible.every((person) => selectedIds.has(person.id))}
            >
              Select {search.trim() ? "these" : "all"}
            </Button>
          )}

          {selected.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              disabled={disabled}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="relative">
        <Search
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <Input
          id="admin-recipient-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search administrators by name or department"
          disabled={disabled}
          className="pl-9"
        />
      </div>

      {/*
        The chips are the answer to "show the selected recipients clearly before
        sending". They sit above the list rather than below it, because the list
        scrolls and a summary somebody has to scroll past is a summary they do
        not read.
      */}
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {selected.map((person) => (
            <li key={person.id}>
              <Badge variant="secondary" className="gap-1.5 py-1 pr-1 pl-2.5">
                <span className="max-w-40 truncate">{person.name}</span>
                <button
                  type="button"
                  onClick={() => toggle(person)}
                  disabled={disabled}
                  className="hover:bg-foreground/10 rounded-full p-0.5 transition-colors"
                  aria-label={`Remove ${person.name}`}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <div className="border-border/60 max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
        {loading && <p className="text-muted-foreground px-3 py-6 text-sm">Loading administrators…</p>}

        {!loading && visible.length === 0 && (
          <EmptyState
            icon={ShieldCheck}
            title={search.trim() ? "Nobody matches" : "No other administrators"}
            description={
              search.trim()
                ? "Try a different name or department."
                : "There is nobody else with an administrator account to write to."
            }
            inset={false}
          />
        )}

        {!loading &&
          visible.map((person) => {
            const chosen = selectedIds.has(person.id);

            return (
              <button
                key={person.id}
                type="button"
                onClick={() => toggle(person)}
                disabled={disabled}
                aria-pressed={chosen}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left",
                  "ease-standard transition-colors duration-200",
                  chosen
                    ? "bg-brand/12 shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_30%,transparent)]"
                    : "hover:bg-accent/60",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-sm",
                    chosen
                      ? "bg-primary text-primary-foreground"
                      : "shadow-[inset_0_0_0_1px_var(--border)]",
                  )}
                  aria-hidden
                >
                  {chosen && <Check className="size-3.5" />}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{person.name}</span>
                  {person.department && (
                    <span className="text-muted-foreground block truncate text-xs">
                      {person.department}
                    </span>
                  )}
                </span>

                <Badge variant="outline" className="shrink-0">
                  Admin
                </Badge>
              </button>
            );
          })}
      </div>
    </div>
  );
}
