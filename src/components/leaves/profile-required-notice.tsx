import Link from "next/link";
import { UserPen } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";

/**
 * Stands in for the leave assistant while the viewer's profile is incomplete.
 *
 * In practice only administrators see it: employees are held at profile setup
 * by the middleware, whereas admins are waved past it so they can start
 * managing straight away — which leaves them able to reach this screen with
 * their own department and joining date still blank. The API refuses either
 * way; this turns that refusal into somewhere to go.
 */
export function ProfileRequiredNotice({ inset = true }: { inset?: boolean }) {
  return (
    <EmptyState
      icon={UserPen}
      title="Finish your profile first"
      description="Your leave is recorded against your department and joining date, so those need filling in before you can book time off."
      inset={inset}
      action={
        <Button asChild>
          <Link href={ROUTES.profile}>Go to my profile</Link>
        </Button>
      }
    />
  );
}
