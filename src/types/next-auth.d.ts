import type { EmployeeStatus, Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      status: EmployeeStatus;
      profileComplete: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    status: EmployeeStatus;
    profileComplete: boolean;
  }
}

// `next-auth/jwt` only re-exports from `@auth/core/jwt`, and augmenting a
// re-export does not merge into the original interface — so declare it here.
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    status: EmployeeStatus;
    profileComplete: boolean;
  }
}

export {};
