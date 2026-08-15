"use client";

import { useMemo, useState } from "react";
import { Check, Search, UserPlus, Users, X } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useApiResource } from "@/hooks/use-api-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toQueryString } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { ReportPersonView } from "@/types";

/**
 * Choosing the people a report is about.
 *
 * The search runs on the **server** rather than over a list fetched once and
 * filtered here: the endpoint is capped, so a client-side filter would search
 * only the first page of an organisation and quietly report that nobody else
 * exists. It is the same reason the report itself narrows server-side.
 *
 * **Every candidate shows its email**, always, and that is not decoration. Name,
 * department and job title can all three be identical — this database holds two
 * active accounts both called "sufyan khan" — at which point two rows render the
 * same text and the picker has made its own question unanswerable. The address
 * is unique on the table, so it can always separate them, exactly as the
 * assistant's disambiguation uses it for.
 *
 * Selections **survive a change of search term**, which is what makes picking
 * four people across an organisation possible: the chips are the state, the list
 * is only a way of reaching it.
 */
export function ReportPeoplePicker({
  population,
  selected,
  onChange,
  disabled = false,
}: {
  /** Which population may be picked from, mirroring the people selection. */
  population: "EMPLOYEE" | "ADMIN";
  /** The chosen people, kept whole so a chip can be removed without the list. */
  selected: ReportPersonView[];
  onChange: (people: ReportPersonView[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const { data, loading, error } = useApiResource<{ items: ReportPersonView[] }>(
    // Not fetched until the dialog is opened: an administrator who never picks
    // individuals should not pay for the list of everybody they could have.
    open ? `/api/admin/reports/people${toQueryString({ population, search: debouncedSearch || undefined })}` : null,
  );

  const candidates = data?.items ?? [];
  const selectedIds = useMemo(() => new Set(selected.map((person) => person.id)), [selected]);

  function toggle(person: ReportPersonView) {
    onChange(
      selectedIds.has(person.id)
        ? selected.filter((chosen) => chosen.id !== person.id)
        : [...selected, person],
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled}>
          <UserPlus className="size-4" />
          {selected.length === 0 ? "Choose people" : "Change selection"}
        </Button>

        {selected.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([])} disabled={disabled}>
            Clear
          </Button>
        )}

        <span className="text-muted-foreground text-xs tabular-nums">
          {selected.length} selected
        </span>
      </div>

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
                  className="hover:bg-accent rounded-full p-0.5 disabled:pointer-events-none"
                  aria-label={`Remove ${person.name} from the selection`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Choose {population === "ADMIN" ? "administrators" : "employees"}
            </DialogTitle>
            <DialogDescription>
              Search by name, email, department or job title. Everyone you pick stays selected while
              you search for the next.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search people…"
              className="pl-9"
              aria-label="Search people"
              autoFocus
            />
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto">
            {loading &&
              Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full rounded-lg" />
              ))}

            {!loading && error && (
              <EmptyState icon={Users} title="Couldn't load people" description={error} inset={false} />
            )}

            {!loading && !error && candidates.length === 0 && (
              <EmptyState
                icon={Users}
                title="Nobody matches"
                description={
                  search
                    ? "Try a different name or email address."
                    : "There are no accounts in this population yet."
                }
                inset={false}
              />
            )}

            {!loading &&
              !error &&
              candidates.map((person) => {
                const chosen = selectedIds.has(person.id);

                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggle(person)}
                    aria-pressed={chosen}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left",
                      "transition-colors duration-200 ease-standard",
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
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{person.name}</span>
                        {/*
                          Said out loud rather than left to be inferred from the
                          population that was searched: a suspended account can
                          be reported on, and somebody picking one should know
                          before the report reads as a month of absences.
                        */}
                        {person.status !== "ACTIVE" && (
                          <Badge variant="warning" className="shrink-0">
                            Suspended
                          </Badge>
                        )}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {person.email}
                        {person.department ? ` · ${person.department}` : ""}
                      </span>
                    </span>

                    <Badge variant="outline" className="shrink-0">
                      {person.role === "EMPLOYEE" ? "Employee" : person.role === "ADMIN" ? "Admin" : "Owner"}
                    </Badge>
                  </button>
                );
              })}
          </div>

          <DialogFooter>
            <span className="text-muted-foreground mr-auto text-sm tabular-nums">
              {selected.length} selected
            </span>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
