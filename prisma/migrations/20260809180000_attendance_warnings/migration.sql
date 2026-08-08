-- Attendance warnings: a letter to anyone who missed the day's deadline.
--
-- Two tables. The policy is a singleton holding the cutoff and the working week;
-- the warnings table is one row per person per missed day, and the row is the
-- claim rather than the receipt — inserted before the email is written, so a
-- unique index decides which of two racing sweeps gets to send it.

-- CreateTable
CREATE TABLE "public"."attendance_policy" (
    "id" TEXT NOT NULL DEFAULT 'policy',
    -- Minutes after midnight on the company's clock. 1020 = 17:00.
    "cutoffMinutes" INTEGER NOT NULL DEFAULT 1020,
    -- ISO weekdays attendance is expected on, 1 = Monday. Without this the sweep
    -- would write to the whole company every Saturday and Sunday, since nothing
    -- else in this schema knows a weekend from a working day.
    "workingDays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "warningsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "attendance_policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."attendance_warnings" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    -- What the letter actually said, kept rather than recomputed: a closure
    -- declared later would change the answer without changing the words already
    -- sitting in somebody's inbox.
    "consecutiveMissed" INTEGER NOT NULL DEFAULT 1,
    -- Null means claimed but delivery never confirmed. Deliberately not retried.
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_warnings_pkey" PRIMARY KEY ("id")
);

-- One letter per person per day, settled by the database rather than by the
-- sweep that looked a moment earlier.
CREATE UNIQUE INDEX "attendance_warnings_employeeId_date_key" ON "public"."attendance_warnings"("employeeId", "date");

CREATE INDEX "attendance_warnings_date_idx" ON "public"."attendance_warnings"("date");

-- SetNull: who last changed the policy is a note, not a dependency. Removing
-- that administrator must not take the company's working day down with them.
ALTER TABLE "public"."attendance_policy" ADD CONSTRAINT "attendance_policy_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Cascades: a warning records that one particular account missed a day, so once
-- that account is gone it describes nobody.
ALTER TABLE "public"."attendance_warnings" ADD CONSTRAINT "attendance_warnings_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
