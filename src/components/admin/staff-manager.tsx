"use client";

import { Shield, Users } from "lucide-react";

import { EmployeeManager } from "@/components/admin/employee-manager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE } from "@/lib/enums";

/**
 * Splits the staff into the two populations a super admin manages.
 *
 * Each tab mounts its own `EmployeeManager`, so search, filters, sorting and
 * page position stay independent — switching back to Employees does not reset
 * what you had narrowed it down to.
 */
export function StaffManager() {
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
        <EmployeeManager role={ROLE.ADMIN} />
      </TabsContent>
    </Tabs>
  );
}
