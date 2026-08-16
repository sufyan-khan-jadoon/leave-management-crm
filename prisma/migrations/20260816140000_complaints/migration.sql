-- Employee complaints, and the right to read them.

-- Every one of these is reachable, unlike LeaveStatus, whose PENDING and
-- REJECTED are write-dead. A complaint is decided by a person, not a policy.
CREATE TYPE "public"."ComplaintStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- The seventh delegable right, off by default for administrators who already
-- exist. A complaint is somebody reporting a workplace problem in the
-- expectation that only the people who can act on it will read it, so having
-- been an administrator before this migration ran is not a reason to inherit it.
ALTER TABLE "public"."employees" ADD COLUMN "canManageComplaints" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "public"."complaints" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."ComplaintStatus" NOT NULL DEFAULT 'PENDING',
    "resolution" TEXT,
    -- Admin-only. Never selected into anything an employee can reach.
    "internalNotes" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    -- The claim that stops a second resolution email, and the proof one arrived.
    -- Claimed with sentAt still null means tried and failed, which the admin
    -- screen reports rather than hides.
    "resolutionNoticeClaimedAt" TIMESTAMP(3),
    "resolutionNoticeSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- A table of its own so the bytes live somewhere the list query never touches.
CREATE TABLE "public"."complaint_attachments" (
    "id" TEXT NOT NULL,
    "complaintId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "complaint_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "complaints_employeeId_createdAt_idx" ON "public"."complaints"("employeeId", "createdAt");

CREATE INDEX "complaints_status_idx" ON "public"."complaints"("status");

CREATE INDEX "complaints_createdAt_idx" ON "public"."complaints"("createdAt");

CREATE INDEX "complaint_attachments_complaintId_idx" ON "public"."complaint_attachments"("complaintId");

-- Cascade: a complaint is about the person who wrote it, and one nobody can
-- follow up is only a copy of their private words with no one left to act on it.
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull, matching Attendance.markedBy: removing the administrator who resolved
-- something must not remove the resolution, nor the complaint it was about.
ALTER TABLE "public"."complaints" ADD CONSTRAINT "complaints_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."complaint_attachments" ADD CONSTRAINT "complaint_attachments_complaintId_fkey" FOREIGN KEY ("complaintId") REFERENCES "public"."complaints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
