import { MINUTES_IN_DAY } from "@/lib/attendance-policy";
import { ValidationError } from "@/lib/errors";
import {
  attendancePolicyRepository,
  type AttendancePolicyDto,
} from "@/repositories/attendance-policy.repository";
import type { UpdateAttendancePolicyInput } from "@/validations/attendance.schema";

/**
 * The company's attendance rules.
 *
 * Reading is open to any administrator — knowing when the day ends is everyone's
 * business, and the screens need it to explain themselves. Writing is the super
 * admin's alone, gated in the route rather than here, because unlike closing the
 * office this is not delegated per-administrator: there is one working day and
 * one person who decides it.
 */
export const attendancePolicyService = {
  get(): Promise<AttendancePolicyDto> {
    return attendancePolicyRepository.get();
  },

  async update(actorId: string, input: UpdateAttendancePolicyInput): Promise<AttendancePolicyDto> {
    // Belt and braces over the schema: these are the two values that decide
    // whether anybody is warned at all, and a policy with no working days would
    // quietly switch the whole feature off while appearing configured.
    if (input.cutoffMinutes !== undefined) {
      if (!Number.isInteger(input.cutoffMinutes) || input.cutoffMinutes < 0 || input.cutoffMinutes >= MINUTES_IN_DAY) {
        throw new ValidationError("Choose a time of day.", { cutoffMinutes: "Enter a time between 00:00 and 23:59." });
      }
    }

    if (input.workingDays !== undefined && input.workingDays.length === 0) {
      throw new ValidationError("Choose at least one working day.", {
        workingDays: "Attendance cannot be expected on no days at all.",
      });
    }

    return attendancePolicyRepository.update(
      {
        ...(input.cutoffMinutes !== undefined ? { cutoffMinutes: input.cutoffMinutes } : {}),
        // Sorted and de-duplicated so the stored set reads the way a week does,
        // whatever order the checkboxes came back in.
        ...(input.workingDays !== undefined
          ? { workingDays: [...new Set(input.workingDays)].sort((a, b) => a - b) }
          : {}),
        ...(input.warningsEnabled !== undefined ? { warningsEnabled: input.warningsEnabled } : {}),
      },
      actorId,
    );
  },
};
