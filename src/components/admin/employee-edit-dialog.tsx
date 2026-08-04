"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { DEPARTMENTS } from "@/lib/constants";
import { adminEmployeeUpdateSchema, type AdminEmployeeUpdateInput } from "@/validations/employee.schema";
import type { EmployeeView } from "@/types";

type EmployeeEditDialogProps = {
  employee: EmployeeView | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function EmployeeEditDialog({ employee, open, onOpenChange, onSaved }: EmployeeEditDialogProps) {
  const form = useForm<AdminEmployeeUpdateInput>({
    resolver: zodResolver(adminEmployeeUpdateSchema),
    defaultValues: { name: "", email: "", phone: "", department: "", position: "", joiningDate: "" },
  });

  const { reset } = form;

  // Re-seed the form whenever a different employee is opened.
  useEffect(() => {
    if (!employee) return;

    reset({
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? "",
      department: employee.department ?? "",
      position: employee.position ?? "",
      joiningDate: employee.joiningDate?.slice(0, 10) ?? "",
    });
  }, [employee, reset]);

  async function onSubmit(values: AdminEmployeeUpdateInput) {
    if (!employee) return;

    try {
      await apiClient.patch(`/api/admin/employees/${employee.id}`, values);

      toast.success(`${values.name ?? employee.name}'s profile was updated.`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.details) {
          for (const [field, message] of Object.entries(error.details)) {
            if (field in values) form.setError(field as keyof AdminEmployeeUpdateInput, { message });
          }
        }

        toast.error(error.message);
        return;
      }

      toast.error("Could not save changes. Please try again.");
    }
  }

  const departmentOptions =
    employee?.department && !DEPARTMENTS.includes(employee.department as never)
      ? [employee.department, ...DEPARTMENTS]
      : [...DEPARTMENTS];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit employee</DialogTitle>
          <DialogDescription>
            The employee is emailed whenever an administrator changes their details.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input type="tel" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="joiningDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Joining date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department</FormLabel>
                    <Select value={field.value ?? ""} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a department" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {departmentOptions.map((department) => (
                          <SelectItem key={department} value={department}>
                            {department}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
