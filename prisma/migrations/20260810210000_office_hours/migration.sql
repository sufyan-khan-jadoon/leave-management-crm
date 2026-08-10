-- Office hours: the times the company keeps, on the singleton policy row.
--
-- Published facts, not rules. Nothing judges a check-in by them — attendance is
-- decided by the geofence and by whether the office was open that day, never by
-- the clock. They exist because people asked the leave assistant what the hours
-- were and it had nothing to read from, so it invented "9:00 AM to 5:00 PM,
-- Monday to Friday" — a sentence that was in no table and got the working week
-- wrong for anybody not resting at the weekend.
--
-- 9-to-5 is a starting value in exactly the way ARRAY[1,2,3,4,5] is: the defaults
-- keep existing rows sensible on deploy, and are not an assumption about anyone.

ALTER TABLE "public"."attendance_policy"
  ADD COLUMN "openingMinutes" INTEGER NOT NULL DEFAULT 540,
  ADD COLUMN "closingMinutes" INTEGER NOT NULL DEFAULT 1020;
