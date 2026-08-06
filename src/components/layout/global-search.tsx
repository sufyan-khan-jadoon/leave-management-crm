"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Search, User } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useApiResource } from "@/hooks/use-api-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate } from "@/lib/date";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toQueryString } from "@/lib/api-client";
import type { SearchResultsView } from "@/types";

/**
 * Global search across employees and leave reasons. Results are scoped
 * server-side: employees only ever match their own leaves.
 */
export function GlobalSearch({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debounced = useDebouncedValue(term.trim(), 300);
  const path = debounced.length >= 2 ? `/api/search${toQueryString({ q: debounced, limit: 5 })}` : null;
  const { data, loading } = useApiResource<SearchResultsView>(path);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    setTerm("");
    router.push(href);
  }

  const hasResults = Boolean(data && data.total > 0);
  const showPanel = open && debounced.length >= 2;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={isAdmin ? "Search employees, leave reasons…" : "Search your leave history…"}
        className="pl-9"
        aria-label="Global search"
      />

      {loading && (
        <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
      )}

      {showPanel && (
        <div className="glass-strong scrollbar-thin animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 absolute top-full z-50 mt-2 max-h-96 w-full overflow-y-auto rounded-xl p-1.5 duration-200 ease-standard">
          {!hasResults && !loading && (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              No matches for &ldquo;{debounced}&rdquo;.
            </p>
          )}

          {data && data.employees.length > 0 && (
            <Section title="Employees">
              {data.employees.map((employee) => (
                <ResultRow
                  key={employee.id}
                  icon={<User className="size-4" />}
                  title={employee.name}
                  subtitle={`${employee.email}${employee.department ? ` · ${employee.department}` : ""}`}
                  onSelect={() => go(`${ROUTES.adminEmployees}/${employee.id}`)}
                />
              ))}
            </Section>
          )}

          {data && data.leaves.length > 0 && (
            <Section title="Leave requests">
              {data.leaves.map((leave) => (
                <ResultRow
                  key={leave.id}
                  icon={<CalendarDays className="size-4" />}
                  title={leave.reason}
                  subtitle={`${isAdmin ? `${leave.employee.name} · ` : ""}${formatDate(leave.leaveDate)} · ${leave.status.toLowerCase()}`}
                  onSelect={() => go(isAdmin ? ROUTES.adminLeaves : ROUTES.leaves)}
                />
              ))}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="text-muted-foreground px-3 py-1.5 text-[0.6875rem] font-semibold tracking-[0.06em] uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  onSelect,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "hover:bg-accent/70 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left",
        "transition-[background-color,transform] duration-150 ease-standard active:scale-[0.99]",
      )}
    >
      <span className="bg-primary/10 text-primary-ink flex size-8 shrink-0 items-center justify-center rounded-sm">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="text-muted-foreground block truncate text-xs">{subtitle}</span>
      </span>
    </button>
  );
}
