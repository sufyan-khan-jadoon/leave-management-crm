import type { NextAuthConfig } from "next-auth";

import { ROUTES } from "@/lib/constants";

/**
 * Edge-safe half of the auth setup.
 *
 * `middleware.ts` runs on the Edge runtime, where Prisma and bcrypt cannot be
 * bundled. Keeping providers/callbacks that need Node here-free lets middleware
 * import this config while the full config (auth.ts) stays Node-only.
 */
export const authConfig = {
  pages: {
    signIn: ROUTES.login,
    error: ROUTES.login,
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.status = user.status;
        token.profileComplete = user.profileComplete;
      }

      // `useSession().update()` after profile setup refreshes the flag without
      // forcing the user to sign out and back in.
      if (trigger === "update" && session?.profileComplete !== undefined) {
        token.profileComplete = Boolean(session.profileComplete);
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.status = token.status;
        session.user.profileComplete = token.profileComplete;
      }

      return session;
    },
  },
} satisfies NextAuthConfig;
