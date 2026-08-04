"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { SendHorizontal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { ApiClientError, apiClient } from "@/lib/api-client";
import { ROUTES } from "@/lib/constants";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/validations/auth.schema";

export function ForgotPasswordForm() {
  const router = useRouter();

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      await apiClient.post("/api/auth/forgot-password", values);

      // The server answers identically for unknown addresses, so the UI must
      // not imply the account was found.
      toast.success("If an account exists for that address, a code is on its way.");
      router.push(`${ROUTES.resetPassword}?email=${encodeURIComponent(values.email)}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.status === 429) form.setError("email", { message: error.message });
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

        <Button type="submit" className="w-full" size="lg" loading={form.formState.isSubmitting}>
          {!form.formState.isSubmitting && <SendHorizontal className="size-4" />}
          Send reset code
        </Button>

        <p className="text-muted-foreground text-center text-sm">
          Remembered it?{" "}
          <Link href={ROUTES.login} className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      </form>
    </Form>
  );
}
