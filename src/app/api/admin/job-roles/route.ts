import { created, handleRoute, ok, parseBody } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { jobRoleService } from "@/services/job-role.service";
import { jobRoleSchema } from "@/validations/invitation.schema";

/** The shared list of job titles, for the invitation form's picker. */
export async function GET() {
  return handleRoute(async () => {
    await requireAdmin();
    return ok({ items: await jobRoleService.list() });
  });
}

/**
 * Adds a title. Open to any administrator — naming the jobs you hire for is
 * organisational bookkeeping, not a grant of access, so it does not need the
 * same restraint as inviting people.
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    await requireAdmin();
    const { name } = await parseBody(request, jobRoleSchema);

    return created(await jobRoleService.create(name));
  });
}
