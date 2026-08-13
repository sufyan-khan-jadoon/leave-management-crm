-- Recording somebody present without the geofence having proved it.
--
-- Two halves. First the fifth delegable right, off by default like the other
-- four: being an administrator does not by itself confer the ability to write a
-- fact the building would not have proved.
ALTER TABLE "public"."employees" ADD COLUMN "canMarkAttendance" BOOLEAN NOT NULL DEFAULT false;

-- Then the row. The geo columns become nullable because an administrator's
-- assertion carries no position — the alternative was defaulting them to the
-- office's own coordinates, which would forge a reading nobody took and make a
-- vouched-for row indistinguishable from a proved one.
--
-- Widening NOT NULL to NULL preserves every existing row untouched: each keeps
-- the coordinates it was written with, and `markedById IS NULL` continues to be
-- true of all of them, which is exactly what "the geofence proved this" means.
ALTER TABLE "public"."attendance" ALTER COLUMN "latitude" DROP NOT NULL;
ALTER TABLE "public"."attendance" ALTER COLUMN "longitude" DROP NOT NULL;
ALTER TABLE "public"."attendance" ALTER COLUMN "accuracyMeters" DROP NOT NULL;
ALTER TABLE "public"."attendance" ALTER COLUMN "distanceMeters" DROP NOT NULL;

-- The audit trail, on the row rather than in a log table: the unique index on
-- (employeeId, date) means there is only ever one row per person per day to
-- describe, and nothing amends a check-in once it exists.
ALTER TABLE "public"."attendance" ADD COLUMN "markedById" TEXT;
ALTER TABLE "public"."attendance" ADD COLUMN "markedAt" TIMESTAMP(3);
ALTER TABLE "public"."attendance" ADD COLUMN "reason" TEXT;

CREATE INDEX "attendance_markedById_idx" ON "public"."attendance"("markedById");

-- SET NULL, not CASCADE: deleting the administrator who made a correction must
-- not delete the attendance of the person it was about.
ALTER TABLE "public"."attendance"
  ADD CONSTRAINT "attendance_markedById_fkey"
  FOREIGN KEY ("markedById") REFERENCES "public"."employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
