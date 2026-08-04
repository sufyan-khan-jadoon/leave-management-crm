"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Pagination } from "@/types";

type PaginationControlsProps = {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  label?: string;
};

export function PaginationControls({ pagination, onPageChange, label = "items" }: PaginationControlsProps) {
  const { page, pageSize, total, totalPages } = pagination;

  if (total === 0) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-6 py-4 sm:flex-row">
      <p className="text-muted-foreground text-sm">
        Showing <span className="text-foreground font-medium tabular-nums">{first}</span>–
        <span className="text-foreground font-medium tabular-nums">{last}</span> of{" "}
        <span className="text-foreground font-medium tabular-nums">{total}</span> {label}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>

        <span className="text-muted-foreground px-1 text-sm tabular-nums">
          {page} / {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
