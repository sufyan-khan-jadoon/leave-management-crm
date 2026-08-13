"use client";

import { Shield, Users } from "lucide-react";

import { EmployeeManager } from "@/components/admin/employee-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE } from "@/lib/enums";

/**
 * Splits the staff into the two populations.
 *
 * Each tab mounts its own `EmployeeManager`, so search, filters, sorting and
 * page position stay independent — switching back to Employees does not reset
 * what you had narrowed it down to.
 *
 * The Administrators tab is shown to anybody holding `canViewAdminRecords`, but
 * `canManageAdmins` is a separate question with a separate answer: an ordinary
 * administrator may read that roster and act on none of it, so the tab renders
 * and the row menus lose everything but *View profile*.
 */
export function StaffManager({ canManageAdmins = false }: { canManageAdmins?: boolean }) {
  return (
    <Tabs defaultValue={ROLE.EMPLOYEE} className="space-y-4">
      <TabsList>
        <TabsTrigger value={ROLE.EMPLOYEE}>
          <Users aria-hidden />
          Employees
        </TabsTrigger>
        <TabsTrigger value={ROLE.ADMIN}>
          <Shield aria-hidden />
          Administrators
        </TabsTrigger>
      </TabsList>

      <TabsContent value={ROLE.EMPLOYEE}>
        <EmployeeManager role={ROLE.EMPLOYEE} />
      </TabsContent>

      <TabsContent value={ROLE.ADMIN}>
        <EmployeeManager role={ROLE.ADMIN} canManage={canManageAdmins} />
      </TabsContent>
    </Tabs>
  );
}
