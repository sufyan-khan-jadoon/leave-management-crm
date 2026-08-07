import type { Session } from "next-auth";

import { auth } from "@/lib/auth/auth";
import { canSignIn, isAdminRole, isSuperAdminRole } from "@/lib/enums";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";

export type SessionUser = Session["user"];

/** Returns the signed-in user or throws — for use inside route handlers. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();

  if (!session?.user) throw new UnauthorizedError();

  if (!canSignIn(session.user.status)) {
    throw new ForbiddenError("Your account is not active. Please contact your administrator.");
  }

  return session.user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  if (!isAdminRole(user.role)) {
    throw new ForbiddenError("This action requires administrator access.");
  }

  return user;
}

/** Guards the access panel: inviting administrators and deciding their requests. */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();

  if (!isSuperAdminRole(user.role)) {
    throw new ForbiddenError("This action requires super administrator access.");
  }

  return user;
}

/** Allows access when the viewer owns the record, or is an admin. */
export function assertOwnerOrAdmin(user: SessionUser, ownerId: string): void {
  if (!isAdminRole(user.role) && user.id !== ownerId) {
    throw new ForbiddenError("You can only access your own records.");
  }
}
