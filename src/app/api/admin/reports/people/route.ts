import { handleRoute, ok, parseQuery } from "@/lib/api";
import { requireAdmin } from "@/lib/auth/guards";
import { reportService } from "@/services/report.service";
import { reportPeopleQuerySchema } from "@/validations/report.schema";

/**
 * The people a report may be pointed at, for the picker.
 *
 * Behind the same grant as the report itself rather than a looser one, because
 * this list is the sensitive half: it names every colleague **and says what each
 * of them is**, which is precisely what `canViewAdminRecords` exists to gate.
 * A picker open to every administrator would hand that over without a report
 * ever being generated. `reportService.people` asserts it; the guard here only
 * establishes that this is an administrator at all.
 *
 * A `GET`, unlike generating: the query is a search term and a population, which
 * is what a query string is for.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    const user = await requireAdmin();
    const query = parseQuery(request, reportPeopleQuerySchema);

    return ok({ items: await reportService.people(user, query) });
  });
}
