-- Remote work: an attendance-exempt stretch of days for one person.
--
-- Nothing here rewrites an existing row. The exemption is derived on read from
-- `remote_work_assignments`, exactly as absence and office closures already are,
-- so historical attendance and leave are untouched by this migration and stay
-- exactly as they were recorded.

-- CreateEnum
CREATE TYPE "RemoteWorkType" AS ENUM ('TODAY', 'TOMORROW', 'WEEK', 'MONTH', 'CUSTOM', 'UNTIL_REVOKED');

-- CreateEnum
CREATE TYPE "RemoteWorkAction" AS ENUM ('ASSIGNED', 'MODIFIED', 'REVOKED');

-- AlterTable
-- The eighth delegable right. Off for everybody, including administrators who
-- already hold the other seven: putting somebody beyond the attendance register
-- is not something an existing grant should silently start buying.
ALTER TABLE "employees" ADD COLUMN "canManageRemoteWork" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "remote_work_assignments" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "type" "RemoteWorkType" NOT NULL,
    "reason" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedById" TEXT NOT NULL,

    CONSTRAINT "remote_work_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "remote_work_events" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "action" "RemoteWorkAction" NOT NULL,
    "previousStart" DATE,
    "previousEnd" DATE,
    "newStart" DATE,
    "newEnd" DATE,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" TEXT,

    CONSTRAINT "remote_work_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Both halves of the one coverage predicate: `startDate <= day AND (endDate IS
-- NULL OR endDate >= day)`, asked per person by a profile and company-wide by
-- the roster.
CREATE INDEX "remote_work_assignments_employeeId_startDate_endDate_idx" ON "remote_work_assignments"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "remote_work_assignments_startDate_endDate_idx" ON "remote_work_assignments"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "remote_work_events_assignmentId_createdAt_idx" ON "remote_work_events"("assignmentId", "createdAt");

-- CreateIndex
CREATE INDEX "remote_work_events_employeeId_createdAt_idx" ON "remote_work_events"("employeeId", "createdAt");

-- AddForeignKey
ALTER TABLE "remote_work_assignments" ADD CONSTRAINT "remote_work_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- Restricted: deleting the administrator who put somebody on remote work must
-- not put that person back on the attendance register as a side effect.
ALTER TABLE "remote_work_assignments" ADD CONSTRAINT "remote_work_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_work_assignments" ADD CONSTRAINT "remote_work_assignments_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_work_events" ADD CONSTRAINT "remote_work_events_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "remote_work_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_work_events" ADD CONSTRAINT "remote_work_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
