import { EmployeeStatus, Role } from "@prisma/client";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth/auth";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export type SessionUser = Session["user"];

/** Returns the signed-in user or throws — for use inside route handlers. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user) throw new UnauthorizedError();

  if (session.user.status === EmployeeStatus.SUSPENDED) {
    throw new ForbiddenError("Your account has been suspended. Please contact your HR administrator.");
  }

  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  if (user.role !== Role.ADMIN) {
    throw new ForbiddenError("This action requires administrator access.");
  }

  return user;
}

/** Allows access when the viewer owns the record, or is an admin. */
export function assertOwnerOrAdmin(user: SessionUser, ownerId: string): void {
  if (user.role !== Role.ADMIN && user.id !== ownerId) {
    throw new ForbiddenError("You can only access your own records.");
  }
}
