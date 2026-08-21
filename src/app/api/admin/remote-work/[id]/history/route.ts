import { handleRoute, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { serializeRemoteWorkEvent } from "@/lib/serialize";
import { remoteWorkService } from "@/services/remote-work.service";

/**
 * One arrangement's audit trail — what was assigned, what was changed, when, and
 * by whom.
 *
 * Behind the management grant rather than bare `requireAdmin`, unlike the list
 * beside it: seeing *that* somebody is remote is ordinary people-management,
 * where reading the sequence of decisions taken about their working arrangement
 * is the management view of it. `remoteWorkService.history` asserts it — the
 * route guards the looser check, and the service settles the real one, the same
 * split every other delegable right here uses.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;

    const events = await remoteWorkService.history(user, id);

    return ok({ items: events.map(serializeRemoteWorkEvent) });
  });
}
