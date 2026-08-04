import { handleRoute, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/guards";
import { employeeService } from "@/services/employee.service";
import { isProfileComplete } from "@/services/auth.service";
import { profileSetupSchema, profileUpdateSchema } from "@/validations/employee.schema";

export async function GET() {
  return handleRoute(async () => {
    const user = await requireUser();
    const employee = await employeeService.byId(user.id);

    return ok({ employee, profileComplete: isProfileComplete(employee) });
  });
}

/** Completes the post-verification profile setup step. */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const input = await parseBody(request, profileSetupSchema);
    const employee = await employeeService.completeProfile(user.id, input);

    return ok({ employee, profileComplete: isProfileComplete(employee) });
  });
}

/** Self-service profile edit. */
export async function PATCH(request: Request) {
  return handleRoute(async () => {
    const user = await requireUser();
    const input = await parseBody(request, profileUpdateSchema);
    const employee = await employeeService.updateOwnProfile(user.id, input);

    return ok({ employee, profileComplete: isProfileComplete(employee) });
  });
}
