import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { customEmailService } from "@/services/custom-email.service";
import { emailRecipientQuerySchema } from "@/validations/email.schema";

/**
 * People the caller may address one at a time.
 *
 * Deliberately its own endpoint rather than a mode of `/api/admin/employees`:
 * that one is a roster with filters and a role parameter, and reusing it would
 * mean the compose box inherited a surface built for a different question.
 *
 * The response carries no email addresses. A name, a role and a department are
 * enough to tell two colleagues apart, and the server is the only thing that
 * needs to know where a message actually goes — a picker that returned every
 * mailbox would be a directory export with a text box attached.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { search } = parseQuery(request, emailRecipientQuerySchema);

    const items = await customEmailService.recipientOptions(user, search);

    return ok({ items });
  });
}
