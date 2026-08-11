import { created, handleRoute, ok, parseMultipart, parseQuery } from "@/lib/api";
import { requireAdmin, requireSuperAdmin } from "@/lib/auth/guards";
import { customEmailService } from "@/services/custom-email.service";
import { emailLogQuerySchema, sendCustomEmailSchema } from "@/validations/email.schema";

/**
 * Guarded with the looser `requireAdmin` on purpose — the same shape the
 * invitation and holiday routes take. Whether this particular administrator may
 * send anything, and to whom, is settled in the service against the grant read
 * from the database, not here against the role in the session.
 *
 * `capabilities` rides along so the composer can hide audiences it may not use.
 * It mirrors the real check and never replaces it.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(request, emailLogQuerySchema);

    const capabilities = await customEmailService.capabilities(user);

    // An administrator with no grant gets the shape of the screen and an empty
    // log rather than a 403: the page itself is reachable, it simply has nothing
    // to offer them, and a refusal here would make the nav item look broken.
    if (!capabilities.canSend) {
      return ok({
        capabilities,
        items: [],
        pagination: { page: 1, pageSize: query.pageSize, total: 0, totalPages: 1 },
      });
    }

    const { items, total } = await customEmailService.history(user, query);

    return ok({
      capabilities,
      items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    });
  });
}

/**
 * Multipart rather than JSON, because a message may carry files.
 *
 * One encoding for both kinds of send: a text-only message is the same request
 * with no file parts on it, so there is no second path that could drift out of
 * step with this one. The handler stays what it always was — parse, guard,
 * shape — and hands the files to the service, which is where whether they may
 * be sent is decided, alongside whether *this* administrator may send to *that*
 * audience.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { data, files } = await parseMultipart(request, sendCustomEmailSchema, "attachments");

    const result = await customEmailService.send(user, data, files);

    return created(result);
  });
}

/**
 * Clears the sent-message log.
 *
 * Guarded with `requireSuperAdmin` rather than the looser `requireAdmin` the
 * other two verbs take, and that difference is the point: sending is delegable
 * through `canSendEmails`, and erasing the record of having sent is not. The
 * service refuses non-owners again regardless, so the two cannot drift apart.
 *
 * No body, because there is nothing to say — the log goes whole or not at all,
 * and a scope parameter would only ever be used to keep somebody's own rows.
 */
export async function DELETE() {
  return handleRoute(async () => {
    const user = await requireSuperAdmin();

    return ok(await customEmailService.clearHistory(user));
  });
}
