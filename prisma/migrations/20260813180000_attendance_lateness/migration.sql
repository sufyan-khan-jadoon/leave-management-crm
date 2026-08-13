-- The cutoff each attendance row was judged against.
--
-- Lateness is computed on every read, but from a basis frozen on the row rather
-- than from today's policy: moving the deadline next month must not rewrite how
-- late somebody was last week. The row stores the *input*, never the verdict, so
-- there is no second copy of the answer to drift from the check-in time.
--
-- Added nullable, backfilled, then made NOT NULL. Existing rows take the policy
-- currently configured, which is the only honest value available for them —
-- there is no record of what the cutoff was when each was written, and the
-- alternative of leaving them null would mean every past day reported no
-- lateness at all rather than reporting it against the deadline in force.
ALTER TABLE "public"."attendance" ADD COLUMN "lateBasisMinutes" INTEGER;

UPDATE "public"."attendance"
SET "lateBasisMinutes" = COALESCE(
  (SELECT "cutoffMinutes" FROM "public"."attendance_policy" LIMIT 1),
  1020
)
WHERE "lateBasisMinutes" IS NULL;

ALTER TABLE "public"."attendance" ALTER COLUMN "lateBasisMinutes" SET NOT NULL;
