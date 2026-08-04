"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useSession } from "next-auth/react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { AvatarUpload } from "@/components/profile/avatar-upload";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { DEPARTMENTS, ROUTES } from "@/lib/constants";
import { profileSetupSchema, type ProfileSetupInput } from "@/validations/employee.schema";
import type { EmployeeView } from "@/types";

type ProfileFormProps = {
  employee: EmployeeView;
  /** Setup runs once after verification; edit is the ongoing self-service form. */
  mode: "setup" | "edit";
  onSaved?: (employee: EmployeeView) => void;
};

export function ProfileForm({ employee, mode, onSaved }: ProfileFormProps) {
  const router = useRouter();
  const { update } = useSession();

  const form = useForm<ProfileSetupInput>({
    resolver: zodResolver(profileSetupSchema),
    defaultValues: {
      phone: employee.phone ?? "",
      department: employee.department ?? "",
      position: employee.position ?? "",
      joiningDate: employee.joiningDate?.slice(0, 10) ?? "",
      profilePhoto: employee.profilePhoto ?? "",
    },
  });

  async function onSubmit(values: ProfileSetupInput) {
    try {
      const response = await apiClient[mode === "setup" ? "post" : "patch"]<{
        employee: EmployeeView;
        profileComplete: boolean;
      }>("/api/profile", values);

      // Refresh the JWT so middleware stops redirecting to setup.
      await update({ profileComplete: response.profileComplete });

      toast.success(mode === "setup" ? "Profile complete — welcome aboard!" : "Profile updated.");
      onSaved?.(response.employee);

      if (mode === "setup") {
        router.push(ROUTES.dashboard);
      }

      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.details) {
          for (const [field, message] of Object.entries(error.details)) {
            if (field in values) form.setError(field as keyof ProfileSetupInput, { message });
          }
        }

        toast.error(error.message);
        return;
      }

      toast.error("Could not save your profile. Please try again.");
    }
  }

  const departmentOptions = employee.department && !DEPARTMENTS.includes(employee.department as never)
    ? [employee.department, ...DEPARTMENTS]
    : [...DEPARTMENTS];

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormField
          control={form.control}
          name="profilePhoto"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile photo</FormLabel>
              <FormControl>
                <AvatarUpload name={employee.name} value={field.value} onChange={field.onChange} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Phone number</FormLabel>
                <FormControl>
                  <Input type="tel" autoComplete="tel" placeholder="+92 300 1234567" {...field} />
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
                  <Input type="date" max={new Date().toISOString().slice(0, 10)} {...field} />
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
                <Select value={field.value} onValueChange={field.onChange}>
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
                  <Input placeholder="Frontend Engineer" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" size="lg" loading={form.formState.isSubmitting} className="w-full sm:w-auto">
          {!form.formState.isSubmitting && <Save className="size-4" />}
          {mode === "setup" ? "Complete profile" : "Save changes"}
        </Button>
      </form>
    </Form>
  );
}
