"use client";

import { useCallback, useMemo, useState } from "react";
import type { LeaveStatus } from "@prisma/client";

import { useApiResource } from "@/hooks/use-api-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toQueryString } from "@/lib/api-client";
import type { PaginatedLeaves } from "@/types";

export type LeaveFilters = {
  search: string;
  status: LeaveStatus | "ALL";
  department: string | "ALL";
  /** Employees, administrators, or everybody. Offered only where the grant allows. */
  population: "ALL" | "EMPLOYEE" | "ADMIN";
  sortBy: "leaveDate" | "createdAt" | "status";
  sortDir: "asc" | "desc";
  page: number;
};

const INITIAL: LeaveFilters = {
  search: "",
  status: "ALL",
  department: "ALL",
  population: "ALL",
  sortBy: "leaveDate",
  sortDir: "desc",
  page: 1,
};

/**
 * Owns the filter/sort/pagination state for a leave table and derives both the
 * fetch URL and the CSV export URL from it, so the download always matches
 * what is on screen.
 *
 * `employeeId` pins the table to one person. The personal screens pass the
 * viewer's own id because an admin is not scoped for them: the endpoint answers
 * an admin with the whole roster unless it is told whose leave to return.
 */
export function useLeaveTable(pageSize = 10, employeeId?: string) {
  const [filters, setFilters] = useState<LeaveFilters>(INITIAL);
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 350);

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: filters.status === "ALL" ? undefined : filters.status,
      department: filters.department === "ALL" ? undefined : filters.department,
      // Left off entirely unless it is narrowing something, so an administrator
      // without the grant never sends a parameter the server would refuse.
      population: filters.population === "ALL" ? undefined : filters.population,
      employeeId,
      sortBy: filters.sortBy,
      sortDir: filters.sortDir,
      page: filters.page,
      pageSize,
    }),
    [
      debouncedSearch,
      filters.status,
      filters.department,
      filters.population,
      filters.sortBy,
      filters.sortDir,
      filters.page,
      employeeId,
      pageSize,
    ],
  );

  const resource = useApiResource<PaginatedLeaves>(`/api/leaves${toQueryString(query)}`);
  const exportUrl = `/api/leaves/export${toQueryString({ ...query, page: undefined, pageSize: undefined })}`;

  /** Any filter change resets to page 1 so results aren't hidden on a stale page. */
  const update = useCallback((patch: Partial<LeaveFilters>) => {
    setFilters((current) => ({
      ...current,
      ...patch,
      page: "page" in patch ? (patch.page ?? 1) : 1,
    }));
  }, []);

  const toggleSort = useCallback((column: LeaveFilters["sortBy"]) => {
    setFilters((current) => ({
      ...current,
      sortBy: column,
      sortDir: current.sortBy === column && current.sortDir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }, []);

  const reset = useCallback(() => setFilters(INITIAL), []);

  const hasActiveFilters =
    filters.search !== "" ||
    filters.status !== "ALL" ||
    filters.department !== "ALL" ||
    filters.population !== "ALL";

  return { filters, update, toggleSort, reset, hasActiveFilters, exportUrl, ...resource };
}
