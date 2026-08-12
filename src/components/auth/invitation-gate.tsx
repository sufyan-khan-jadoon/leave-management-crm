import Link from "next/link";
import { CheckCircle2, MailX, ShieldCheck } from "lucide-react";

import { RegisterForm } from "@/components/auth/register-form";
import { ROUTES } from "@/lib/constants";
import { ROLE } from "@/lib/enums";
import { invitationService, type InvitationPreview } from "@/services/invitation.service";

type InvitationGateProps = {
  /** Straight off the query string, so anything at all may arrive here. */
  token: string | undefined;
  /** Wording and the sign-in link only. The invitation decides the role. */
  variant?: "employee" | "admin";
};

/**
 * Turns an invitation link into either a sign-up form or an explanation.
 *
 * Resolved on the server, before anything renders: the recipient clicked a link
 * rather than typing anything, so there is nothing to check as they go, and a
 * dead link should say so immediately instead of flashing a form that then
 * refuses. Nothing here is trusted by the server later — registration resolves
 * the token again and reads the role from the invitation, not from this page.
 */
export async function InvitationGate({ token, variant = "employee" }: InvitationGateProps) {
  const isAdminScreen = variant === "admin";

  // Arriving with no token at all is a different person from arriving with one
  // that no longer resolves: the first has never been invited, the second is
  // holding a link. They were told the same thing, which was wrong for one of
  // them whichever way it read.
  if (!token) return <InvitationNotice state="missing" isAdminScreen={isAdminScreen} />;

  const invitation = await invitationService.preview(token);

  if (invitation.state !== "valid") {
    return <InvitationNotice state={invitation.state} isAdminScreen={isAdminScreen} />;
  }

  const grantsAdmin = invitation.role === ROLE.ADMIN;

  return (
    <div className="space-y-4">
      <div className="bg-brand/8 text-muted-foreground flex items-center gap-2 rounded-lg p-3 text-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_28%,transparent)]">
        <CheckCircle2 className="text-success-ink size-4 shrink-0" aria-hidden />
        <span className="min-w-0 break-all">
          Invitation for <span className="text-foreground font-medium">{invitation.email}</span>
        </span>
      </div>

      {/* Said plainly because the invitation, not the page, decides the role —
          someone who opened the employee screen with an administrator link
          should not be surprised by an approval step, and vice versa. */}
      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <ShieldCheck className="text-primary-ink mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          {grantsAdmin
            ? "You've been invited as an administrator, which a super administrator must approve."
            : "You've been invited as an employee. You can sign in as soon as your email is verified."}
          {invitation.jobTitle ? ` Your job title will be “${invitation.jobTitle}”.` : ""}
        </span>
      </p>

      <RegisterForm variant={grantsAdmin ? "admin" : "employee"} token={token} email={invitation.email} />
    </div>
  );
}

/** Every dead end a link can reach, each with the one thing left to do about it. */
function InvitationNotice({
  state,
  isAdminScreen,
}: {
  /**
   * `missing` is the gate's own, not the service's: no token was presented, so
   * there was nothing to resolve and no preview to ask for.
   */
  state: Exclude<InvitationPreview["state"], "valid"> | "missing";
  isAdminScreen: boolean;
}) {
  const inviter = isAdminScreen ? "your super administrator" : "your administrator";

  const notice = {
    expired: {
      title: "This invitation has expired",
      body: `Invitations are only good for a short while. Ask ${inviter} to send you another one.`,
    },
    accepted: {
      title: "This invitation has already been used",
      body: "An account was created with it. If that was you, sign in below.",
    },
    /**
     * **Resending an invitation replaces its link**, and this is where the old
     * one lands. `resend` mints a fresh token and overwrites `tokenHash` on the
     * same row, so the link already sitting in the recipient's inbox stops
     * matching anything — which is the point, since withdrawing an invitation
     * has to kill the link that was already sent.
     *
     * Only the current hash is stored, so a superseded link is indistinguishable
     * from a string somebody invented, and this wording deliberately does not
     * pretend otherwise: it names the likely cause and the way out without
     * asserting which of the two happened. It used to say "accounts here are
     * created by invitation only" — flatly wrong for the commonest visitor,
     * somebody who *was* invited and opened the older of two emails, and who was
     * being told to go and ask for the thing already in their inbox.
     */
    invalid: {
      title: "This invitation link isn't valid",
      body: `It may have been replaced by a newer one — invitations are reissued each time they're resent, which retires the previous link. Check your email for the most recent invitation from ${inviter}, and open that one. If you've never been invited, ask ${inviter} to invite your email address.`,
    },
    missing: {
      title: "You'll need an invitation",
      body: `Accounts here are created by invitation only. Ask ${inviter} to invite your email address, then open the link they send you.`,
    },
  }[state];

  return (
    <div className="space-y-4">
      <div className="glass-inset space-y-1.5 rounded-lg p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <MailX className="text-destructive-ink size-4 shrink-0" aria-hidden />
          {notice.title}
        </p>
        <p className="text-muted-foreground text-sm">{notice.body}</p>
      </div>

      <p className="text-muted-foreground text-center text-sm">
        Already registered?{" "}
        <Link
          href={isAdminScreen ? ROUTES.adminLogin : ROUTES.login}
          className="text-primary-ink font-medium hover:underline"
        >
          {isAdminScreen ? "Administrator sign in" : "Sign in"}
        </Link>
      </p>
    </div>
  );
}
