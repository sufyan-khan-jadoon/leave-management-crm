import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { searchService } from "@/services/search.service";
import { globalSearchSchema } from "@/validations/leave.schema";

export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const { q, limit } = parseQuery(request, globalSearchSchema);

    const results = await searchService.search(q, limit, { id: user.id, role: user.role });

    return ok(results);
  });
}
