import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { serializeRemoteWork } from "@/lib/serialize";
import { remoteWorkService } from "@/services/remote-work.service";
import {
  revokeRemoteWorkSchema,
  updateRemoteWorkSchema,
  type RevokeRemoteWorkInput,
} from "@/validations/remote-work.schema";

type Context = { params: Promise<{ id: string }> };

/**
 * A revocation body that was actually sent.
 *
 * Written here rather than reached for through `parseBody` because that reads
 * the request itself, and the emptiness has already had to be checked — which
 * needs the text. The failure wording matches `parseBody`'s exactly so a
 * malformed `DELETE` and a malformed `POST` do not report themselves
 * differently.
 */
function parseRevocation(body: string): RevokeRemoteWorkInput {
  let raw: unknown;

  try {
    raw = JSON.parse(body);
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }

  const parsed = revokeRemoteWorkSchema.safeParse(raw);

  if (!parsed.success) {
    throw new ValidationError("The submitted data is invalid.", {
      reason: parsed.error.issues[0]?.message ?? "Invalid reason.",
    });
  }

  return parsed.data;
}

/** Moves a period's dates, or rewrites what was said about it. */
export async function PATCH(request: Request, { params }: Context) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;
    const input = await parseBody(request, updateRemoteWorkSchema);

    const { assignment, emailSent } = await remoteWorkService.update(user, id, input);

    return ok({ assignment: serializeRemoteWork(assignment), emailSent });
  });
}

/**
 * Calls a period off.
 *
 * `DELETE` rather than a `PATCH` carrying a status, because from the caller's
 * side this is the withdrawal of an arrangement — the same verb `/api/admin/holidays/[id]`
 * uses to reopen a closed day. **Nothing is deleted**: revoking truncates the
 * period to today so the days already worked remotely stay exempt, and the row
 * remains as the record of what was arranged and who ended it.
 *
 * It carries an optional body, which `DELETE` permits and which is where the
 * reason arrives. An **empty** body is read as "no reason given", because a
 * `DELETE` sent without one is the ordinary case and refusing it would make the
 * reason mandatory by accident. A body that is present and malformed is still
 * refused — the emptiness is what is tolerated, not the failure to parse, so a
 * reason over the length limit comes back as the validation error it is rather
 * than being silently dropped.
 */
export async function DELETE(request: Request, { params }: Context) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const { id } = await params;

    const body = await request.text();
    const input = body.trim() === ""
      ? { reason: undefined }
      : parseRevocation(body);

    const { assignment, emailSent, resumesOn } = await remoteWorkService.revoke(user, id, input);

    return ok({
      assignment: serializeRemoteWork(assignment),
      emailSent,
      resumesOn: resumesOn.toISOString(),
    });
  });
}
