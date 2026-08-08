-- Attendance: one geofenced check-in per person per working day.
--
-- A row exists only when the server accepted the position, so its presence is
-- the attendance. There is deliberately no ABSENT value and no absent row —
-- absence is the lack of a row, derived on read, so a closure declared after the
-- fact changes what a past day meant without anything being rewritten.

-- CreateEnum
CREATE TYPE "public"."AttendanceStatus" AS ENUM ('PRESENT');

-- CreateTable
CREATE TABLE "public"."attendance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    -- What the device reported, and what the server made of it. Kept together
    -- so a past decision can be re-checked if the office ever moves.
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- One check-in per person per day, settled by the database rather than only by
-- the service that looked a moment earlier. Two taps racing on a patchy mobile
-- connection is the ordinary case, not the exotic one.
CREATE UNIQUE INDEX "attendance_employeeId_date_key" ON "public"."attendance"("employeeId", "date");

-- The admin roster reads a whole day at a time.
CREATE INDEX "attendance_date_idx" ON "public"."attendance"("date");

-- Cascades: a check-in records that one particular account turned up, so once
-- that account is gone it describes nobody.
ALTER TABLE "public"."attendance" ADD CONSTRAINT "attendance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
