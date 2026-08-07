import { AppError } from "@/lib/errors";
import { employeeService } from "@/services/employee.service";

/** The account details the sidebar and topbar show. */
export type ChromeUser = { name: string; email: string; image: string | null };

/**
 * Reads the signed-in account for the app chrome, from the database on every
 * render rather than from the session.
 *
 * The JWT is written once at sign-in and never revisited, so anything copied
 * into it — a name, a photo — is a snapshot of that moment. Uploading an avatar
 * from `/profile` would otherwise not show in the corner of the screen until
 * the token expired a week later, which is exactly long enough to look broken.
 *
 * The photo is kept out of the token for a second reason: avatars are stored as
 * data URLs, so a modest one is tens of kilobytes. Session state travels in a
 * cookie on every single request, and Vercel caps request headers well below
 * that — the cheapest way not to send it is not to put it there.
 *
 * Returns null when the account has since been deleted, so the caller can send
 * a session that no longer refers to anything back to sign-in.
 */
export async function chromeUser(employeeId: string, fallbackName: string): Promise<ChromeUser | null> {
  try {
    const employee = await employeeService.byId(employeeId);

    return {
      name: employee.name || fallbackName,
      email: employee.email,
      image: employee.profilePhoto,
    };
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}
