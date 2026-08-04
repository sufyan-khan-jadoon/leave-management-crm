import { Role } from "@prisma/client";

import { employeeRepository, type EmployeeDto } from "@/repositories/employee.repository";
import { leaveRepository, type LeaveWithEmployeeDto } from "@/repositories/leave.repository";

export type SearchResults = {
  employees: EmployeeDto[];
  leaves: LeaveWithEmployeeDto[];
  total: number;
};

export const searchService = {
  /**
   * Global search across employee name/email/department and leave reasons.
   *
   * Employees only ever see their own leaves; admins see everything and
   * additionally get employee matches.
   */
  async search(term: string, limit: number, viewer: { id: string; role: Role }): Promise<SearchResults> {
    const isAdmin = viewer.role === Role.ADMIN;

    const [employees, leaves] = await Promise.all([
      isAdmin ? employeeRepository.searchBasic(term, limit) : Promise.resolve([]),
      isAdmin
        ? leaveRepository.searchByReason(term, limit)
        : leaveRepository
            .list({
              employeeId: viewer.id,
              search: term,
              page: 1,
              pageSize: limit,
              sortBy: "leaveDate",
              sortDir: "desc",
            })
            .then((result) => result.items),
    ]);

    return { employees, leaves, total: employees.length + leaves.length };
  },
};
