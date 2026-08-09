import { created, handleRoute, ok, parseBody, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
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

export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const input = await parseBody(request, sendCustomEmailSchema);

    const result = await customEmailService.send(user, input);

    return created(result);
  });
}
