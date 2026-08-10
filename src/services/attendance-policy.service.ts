import { isTimeOfDay } from "@/lib/attendance-policy";
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
    if (input.cutoffMinutes !== undefined && !isTimeOfDay(input.cutoffMinutes)) {
      throw new ValidationError("Choose a time of day.", { cutoffMinutes: "Enter a time between 00:00 and 23:59." });
    }

    if (input.openingMinutes !== undefined && !isTimeOfDay(input.openingMinutes)) {
      throw new ValidationError("Choose a time of day.", { openingMinutes: "Enter a time between 00:00 and 23:59." });
    }

    if (input.closingMinutes !== undefined && !isTimeOfDay(input.closingMinutes)) {
      throw new ValidationError("Choose a time of day.", { closingMinutes: "Enter a time between 00:00 and 23:59." });
    }

    // Re-checked here rather than left to the schema, because this is the pair's
    // one invariant and every screen quotes it as a sentence: "9:00 AM to 8:00
    // AM" is not a day, and nothing downstream would notice it was reading one.
    if (
      input.openingMinutes !== undefined &&
      input.closingMinutes !== undefined &&
      input.openingMinutes >= input.closingMinutes
    ) {
      throw new ValidationError("Check the office hours.", {
        closingMinutes: "The office must close after it opens.",
      });
    }

    // `workingDays` shares this row but is not written here — it belongs to
    // `workingDaysService`, because it governs leave as much as attendance.
    return attendancePolicyRepository.update(
      {
        ...(input.cutoffMinutes !== undefined ? { cutoffMinutes: input.cutoffMinutes } : {}),
        ...(input.openingMinutes !== undefined ? { openingMinutes: input.openingMinutes } : {}),
        ...(input.closingMinutes !== undefined ? { closingMinutes: input.closingMinutes } : {}),
        ...(input.warningsEnabled !== undefined ? { warningsEnabled: input.warningsEnabled } : {}),
      },
      actorId,
    );
  },
};
