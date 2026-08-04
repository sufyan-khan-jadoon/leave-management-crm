"use client";

import { useCallback, useMemo, useState } from "react";
import type { EmployeeStatus } from "@prisma/client";

import { useApiResource } from "@/hooks/use-api-resource";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { toQueryString } from "@/lib/api-client";
import type { PaginatedEmployees } from "@/types";

export type EmployeeFilters = {
  search: string;
  status: EmployeeStatus | "ALL";
  department: string | "ALL";
  sortBy: "name" | "createdAt" | "department";
  sortDir: "asc" | "desc";
  page: number;
};

const INITIAL: EmployeeFilters = {
  search: "",
  status: "ALL",
  department: "ALL",
  sortBy: "createdAt",
  sortDir: "desc",
  page: 1,
};

export function useEmployeeTable(pageSize = 10) {
  const [filters, setFilters] = useState<EmployeeFilters>(INITIAL);
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 350);

  const path = useMemo(
    () =>
      `/api/admin/employees${toQueryString({
        search: debouncedSearch || undefined,
        status: filters.status === "ALL" ? undefined : filters.status,
        department: filters.department === "ALL" ? undefined : filters.department,
        sortBy: filters.sortBy,
        sortDir: filters.sortDir,
        page: filters.page,
        pageSize,
      })}`,
    [debouncedSearch, filters.status, filters.department, filters.sortBy, filters.sortDir, filters.page, pageSize],
  );

  const resource = useApiResource<PaginatedEmployees>(path);

  const update = useCallback((patch: Partial<EmployeeFilters>) => {
    setFilters((current) => ({
      ...current,
      ...patch,
      page: "page" in patch ? (patch.page ?? 1) : 1,
    }));
  }, []);

  const toggleSort = useCallback((column: EmployeeFilters["sortBy"]) => {
    setFilters((current) => ({
      ...current,
      sortBy: column,
      sortDir: current.sortBy === column && current.sortDir === "desc" ? "asc" : "desc",
      page: 1,
    }));
  }, []);

  const reset = useCallback(() => setFilters(INITIAL), []);

  const hasActiveFilters =
    filters.search !== "" || filters.status !== "ALL" || filters.department !== "ALL";

  return { filters, update, toggleSort, reset, hasActiveFilters, ...resource };
}
