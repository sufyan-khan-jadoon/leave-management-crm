import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { customEmailService } from "@/services/custom-email.service";
import { emailRecipientQuerySchema } from "@/validations/email.schema";

/**
 * People the caller may address — either one at a time, or as a chosen set of
 * administrators, depending on `scope`.
 *
 * Deliberately its own endpoint rather than a mode of `/api/admin/employees`:
 * that one is a roster with filters and a role parameter, and reusing it would
 * mean the compose box inherited a surface built for a different question. The
 * two scopes share it because they are one question asked of two populations,
 * and a second endpoint is a second place for the permission check to be
 * forgotten — the service asserts per scope, and refuses the administrator list
 * to anybody without the grant however the URL is typed.
 *
 * The response carries no email addresses. A name, a role and a department are
 * enough to tell two colleagues apart, and the server is the only thing that
 * needs to know where a message actually goes — a picker that returned every
 * mailbox would be a directory export with a text box attached.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { search, scope } = parseQuery(request, emailRecipientQuerySchema);

    const items = await customEmailService.recipientOptions(user, { search, scope });

    return ok({ items });
  });
}
