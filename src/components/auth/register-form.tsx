"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Eye, EyeOff, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { registerSchema, type RegisterInput } from "@/validations/auth.schema";
import { PasswordStrength } from "@/components/auth/password-strength";

export function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "", inviteKey: "" },
    mode: "onBlur",
  });

  const password = form.watch("password");

  async function onSubmit(values: RegisterInput) {
    try {
      await apiClient.post("/api/auth/register", values);

      toast.success(
        values.inviteKey?.trim()
          ? "Request submitted — verify your email, then wait for approval."
          : "Account created — check your inbox for a verification code.",
      );
      router.push(`${ROUTES.verifyEmail}?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        // Map field-level server errors back onto the form where possible.
        if (error.details) {
          for (const [field, message] of Object.entries(error.details)) {
            if (field in values) form.setError(field as keyof RegisterInput, { message });
          }
        } else if (error.code === "CONFLICT") {
          form.setError("email", { message: error.message });
        }

        toast.error(error.message);
        return;
      }

      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  placeholder="Ayesha Khan"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
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
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="pr-10"
                    disabled={form.formState.isSubmitting}
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </FormControl>
              <PasswordStrength password={password} />
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="inviteKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Administrator invite key <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="ABCD-EFGH-JKLM-NPQR"
                  className="font-mono uppercase"
                  autoComplete="off"
                  disabled={form.formState.isSubmitting}
                  {...field}
                />
              </FormControl>
              <p className="text-muted-foreground text-xs">
                Leave blank unless your super administrator gave you a key. Requests need approval before
                you can sign in.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          {!form.formState.isSubmitting && <UserPlus className="size-4" />}
          Create account
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link href={ROUTES.login} className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
