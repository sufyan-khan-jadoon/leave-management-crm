import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { AppError } from "@/lib/errors";
import { authConfig } from "@/lib/auth/auth.config";
import { authService } from "@/services/auth.service";
import { loginSchema } from "@/validations/auth.schema";

/**
 * Carries an actionable message (unverified email, suspended account) from the
 * authorize callback to the sign-in page. NextAuth only propagates the `code`,
 * so the message is encoded there.
 */
class CredentialsError extends CredentialsSignin {
  constructor(message: string) {
    super(message);
    this.code = message;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        try {
          return await authService.authenticate(parsed.data);
        } catch (error) {
          if (error instanceof AppError) throw new CredentialsError(error.message);

          console.error("[auth] Unexpected authorize failure:", error);
          return null;
        }
      },
    }),
  ],
});
