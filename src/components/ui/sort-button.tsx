"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

type SortButtonProps = {
  label: string;
  active: boolean;
  direction?: "asc" | "desc";
  onClick: () => void;
};

/**
 * Column sort control. The inactive state shows a neutral double chevron so the
 * column reads as sortable; the active state resolves to a single arrow that
 * points the way the rows actually run.
 */
export function SortButton({ label, active, direction = "desc", onClick }: SortButtonProps) {
  const Icon = !active ? ChevronsUpDown : direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mx-1.5 inline-flex items-center gap-1 rounded-sm px-1.5 py-1",
        "text-[0.6875rem] font-semibold tracking-[0.06em] uppercase",
        "transition-[color,background-color] duration-150 ease-standard",
        "focus-visible:ring-ring/35 outline-none focus-visible:ring-[3px]",
        active ? "text-foreground" : "hover:text-foreground hover:bg-accent/50",
      )}
      aria-label={`Sort by ${label}${active ? `, currently ${direction === "asc" ? "ascending" : "descending"}` : ""}`}
    >
      {label}
      <Icon
        className={cn(
          "size-3 transition-opacity duration-200",
          active ? "text-primary-ink opacity-100" : "opacity-40",
        )}
        aria-hidden
      />
    </button>
  );
}
