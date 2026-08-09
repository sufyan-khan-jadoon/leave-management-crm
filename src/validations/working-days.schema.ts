import { z } from "zod";

/**
 * The organisation's working week.
 *
 * Sent whole rather than as a diff: the screen presents all seven days at once
 * and the saved value is the complete set, so a partial update would leave the
 * server guessing whether an absent day was switched off or simply not
 * mentioned.
 *
 * `min(1)` is the rule that matters. A week with no working days would make
 * every leave request contain zero working days and refuse them all, so it is
 * refused here as well as in the service — this value is read by two separate
 * features and is worth checking twice.
 */
export const updateWorkingWeekSchema = z.object({
  workingDays: z
    .array(z.number().int().min(1, "Days run 1–7").max(7, "Days run 1–7"))
    .min(1, "Choose at least one working day")
    .max(7, "There are only seven days in a week"),
});

export type UpdateWorkingWeekInput = z.infer<typeof updateWorkingWeekSchema>;
