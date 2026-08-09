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
    // Belt and braces over the schema: the cutoff decides when anybody is warned
    // at all, and a nonsensical one would quietly switch the whole feature off
    // while appearing configured.
    if (input.cutoffMinutes !== undefined) {
      if (!Number.isInteger(input.cutoffMinutes) || input.cutoffMinutes < 0 || input.cutoffMinutes >= MINUTES_IN_DAY) {
        throw new ValidationError("Choose a time of day.", { cutoffMinutes: "Enter a time between 00:00 and 23:59." });
      }
    }

    // `workingDays` shares this row but is not written here — it belongs to
    // `workingDaysService`, because it governs leave as much as attendance.
    return attendancePolicyRepository.update(
      {
        ...(input.cutoffMinutes !== undefined ? { cutoffMinutes: input.cutoffMinutes } : {}),
        ...(input.warningsEnabled !== undefined ? { warningsEnabled: input.warningsEnabled } : {}),
      },
      actorId,
    );
  },
};
