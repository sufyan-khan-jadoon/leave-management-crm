import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth/auth.config";
import { RESET_TICKET_COOKIE, ROUTES } from "@/lib/constants";
import { canSignIn, isAdminRole } from "@/lib/enums";

const { auth } = NextAuth(authConfig);

/** Routes reachable without a session. */
const PUBLIC_PATHS = new Set<string>([
  ROUTES.home,
  ROUTES.login,
  ROUTES.register,
  ROUTES.verifyEmail,
  ROUTES.forgotPassword,
  ROUTES.verifyResetCode,
  ROUTES.resetPassword,
  ROUTES.adminLogin,
  ROUTES.adminRegister,
]);

const ADMIN_PREFIX = "/admin";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

/**
 * Edge middleware enforcing the route-level access policy:
 *  - unauthenticated users are bounced to the relevant sign-in page
 *  - suspended accounts are signed out
 *  - non-admins cannot reach /admin
 *  - admins land on the admin dashboard rather than the employee one
 *  - employees with an incomplete profile are funnelled to profile setup
 */
export default auth((request) => {
  const { pathname, search } = request.nextUrl;
  const user = request.auth?.user;
  const isAdminRoute = pathname === ADMIN_PREFIX || pathname.startsWith(`${ADMIN_PREFIX}/`);
  const isAdminLogin = pathname === ROUTES.adminLogin;

  // The password step is only reachable once a code has been verified. Only the
  // cookie's presence is checked here — validating the signature would pull jose
  // and the env schema onto the Edge runtime, and the page and API both verify
  // it properly anyway. This just turns the common "came here directly" case
  // into a real redirect instead of a rendered page that redirects itself.
  if (pathname === ROUTES.resetPassword && !request.cookies.has(RESET_TICKET_COOKIE)) {
    return NextResponse.redirect(new URL(ROUTES.verifyResetCode, request.nextUrl));
  }

  if (!user) {
    if (isPublic(pathname)) return NextResponse.next();

    const signInUrl = new URL(isAdminRoute ? ROUTES.adminLogin : ROUTES.login, request.nextUrl);
    signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(signInUrl);
  }

  if (!canSignIn(user.status)) {
    return NextResponse.redirect(new URL(`${ROUTES.login}?error=AccountSuspended`, request.nextUrl));
  }

  const isAdmin = isAdminRole(user.role);

  // Signed-in users have no reason to sit on an auth or role-selection screen.
  if (
    pathname === ROUTES.home ||
    pathname === ROUTES.login ||
    pathname === ROUTES.register ||
    pathname === ROUTES.adminRegister ||
    isAdminLogin
  ) {
    return NextResponse.redirect(new URL(isAdmin ? ROUTES.adminDashboard : ROUTES.dashboard, request.nextUrl));
  }

  if (isAdminRoute && !isAdmin) {
    return NextResponse.redirect(new URL(ROUTES.dashboard, request.nextUrl));
  }

  if (!isAdmin && !user.profileComplete && pathname !== ROUTES.profileSetup) {
    return NextResponse.redirect(new URL(ROUTES.profileSetup, request.nextUrl));
  }

  // A completed profile means the setup screen has served its purpose.
  if (!isAdmin && user.profileComplete && pathname === ROUTES.profileSetup) {
    return NextResponse.redirect(new URL(ROUTES.dashboard, request.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Page routes only. API routes are deliberately excluded: they enforce
    // access with requireUser/requireAdmin and must answer with 401/403 JSON,
    // whereas middleware would redirect them to an HTML sign-in page.
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
