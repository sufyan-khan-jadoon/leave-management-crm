-- Office days off: dates the whole company is closed, and the announcement
-- that goes out the day before.

-- CreateEnum
CREATE TYPE "public"."HolidayNotice" AS ENUM ('SCHEDULED', 'SENT', 'SKIPPED', 'FAILED', 'CANCELLED');

-- Delegated per administrator, like canInviteEmployees. Off for everyone who
-- already exists: closing the office is granted deliberately, not inherited by
-- having been an admin before this migration ran.
ALTER TABLE "public"."employees" ADD COLUMN "canManageHolidays" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."holidays" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "notice" "public"."HolidayNotice" NOT NULL DEFAULT 'SCHEDULED',
    "noticeDueAt" TIMESTAMP(3),
    "noticeSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "declaredById" TEXT NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- One row per date, so the office cannot be closed twice on the same day and no
-- date can collect two announcements.
CREATE UNIQUE INDEX "holidays_date_key" ON "public"."holidays"("date");

-- The sweep reads on exactly this pair: announcements that are due and unmade.
CREATE INDEX "holidays_notice_noticeDueAt_idx" ON "public"."holidays"("notice", "noticeDueAt");

-- Restricted, not cascading: removing an administrator must never silently
-- reopen a day the whole company has already been told about.
ALTER TABLE "public"."holidays" ADD CONSTRAINT "holidays_declaredById_fkey" FOREIGN KEY ("declaredById") REFERENCES "public"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
