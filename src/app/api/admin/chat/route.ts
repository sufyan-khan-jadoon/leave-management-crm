import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { RATE_LIMITS, enforceRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { adminChatService } from "@/services/admin-chat.service";
import { adminChatSchema } from "@/validations/admin-chat.schema";

/**
 * One turn of the admin workforce assistant.
 *
 * **`requireAdmin` is the access control, not the sidebar.** Hiding the screen
 * from employees is a courtesy; this is the rule, and it runs before the body
 * is even parsed. An employee who finds the URL and posts to it by hand gets
 * 403 and learns nothing — the roster of who was in is exactly the sort of
 * thing they would come here for.
 *
 * Both admin roles, deliberately: an ordinary administrator already sees the
 * whole attendance screen and the whole leave screen, so the assistant reads
 * out nothing they could not page through by hand. It is not narrowed to the
 * super admin the way the population filter is, because unlike that filter it
 * never says what anybody's *role* is.
 *
 * Read-only by construction. There is no write path in `adminChatService` at
 * all: it cannot mark attendance, book leave, or edit an account, so nothing
 * here needs a confirmation step the way the leave assistant does.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();

    // Keyed by account rather than IP: the cost being protected is the AI
    // quota, and it is spent per administrator asking questions.
    enforceRateLimit(rateLimitKey("admin-chat", request, user.id), RATE_LIMITS.aiAdmin);

    const { messages, resolved } = await parseBody(request, adminChatSchema);
    const result = await adminChatService.respond(messages, resolved ?? undefined);

    return ok(result);
  });
}
