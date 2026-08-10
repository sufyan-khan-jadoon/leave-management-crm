"use client";

import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, type Resolver } from "react-hook-form";
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
import { isSuperAdminRole } from "@/lib/enums";
import {
  ownIdentityProfileSchema,
  profileSetupSchema,
  type OwnIdentityProfileInput,
} from "@/validations/employee.schema";
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

  /**
   * The super admin edits their own identity here, and nobody else does.
   *
   * Not a privilege so much as the absence of anywhere else: every other account
   * has an administrator who can change its name, address and title from the
   * Staff screen, and `assertMayManage` refuses that for the owner's row. Without
   * this the owner's own details would be editable by no one at all.
   */
  const canEditIdentity = isSuperAdminRole(employee.role);

  // A job title that already exists came from the invitation, since this is the
  // only self-service form that writes one. It is assigned rather than claimed,
  // so it is shown but not editable here — administrators change it from the
  // Staff screen. The owner is the exception: there is no such administrator.
  const assignedPosition = Boolean(employee.position) && !canEditIdentity;

  const form = useForm<OwnIdentityProfileInput>({
    // Cast because the two schemas have different output types and a ternary
    // between them widens to `FieldValues`. Everyone still validates against the
    // schema that matches what they can actually submit: without the identity
    // fields, `profileSetupSchema` neither checks nor returns them, which is why
    // they cannot ride along unnoticed from a prefilled default.
    resolver: zodResolver(
      canEditIdentity ? ownIdentityProfileSchema : profileSetupSchema,
    ) as unknown as Resolver<OwnIdentityProfileInput>,
    defaultValues: {
      name: employee.name,
      email: employee.email,
      phone: employee.phone ?? "",
      department: employee.department ?? "",
      position: employee.position ?? "",
      joiningDate: employee.joiningDate?.slice(0, 10) ?? "",
      profilePhoto: employee.profilePhoto ?? "",
    },
  });

  async function onSubmit(values: OwnIdentityProfileInput) {
    // Stripped rather than sent and refused: for everybody else these two are
    // prefilled only so the form has one shape, and the server would rightly
    // turn down an address change it never offered.
    const { name: _name, email: _email, ...rest } = values;
    const payload = canEditIdentity ? values : rest;

    try {
      const response = await apiClient[mode === "setup" ? "post" : "patch"]<{
        employee: EmployeeView;
        profileComplete: boolean;
      }>("/api/profile", payload);

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
            if (field in values) form.setError(field as keyof OwnIdentityProfileInput, { message });
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
          {canEditIdentity && (
            <>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full name</FormLabel>
                    <FormControl>
                      <Input autoComplete="name" {...field} />
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
                    <FormLabel>Email address</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
                    </FormControl>
                    <p className="text-muted-foreground text-xs">
                      You sign in with this. Changing it changes how you sign in, and where a
                      password reset would be sent.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          )}

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
                  <Input placeholder="Frontend Engineer" readOnly={assignedPosition} {...field} />
                </FormControl>
                {assignedPosition ? (
                  <p className="text-muted-foreground text-xs">
                    Set by whoever invited you. Ask an administrator if it needs changing.
                  </p>
                ) : (
                  <FormMessage />
                )}
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
