-- AlterTable
ALTER TABLE "public"."employees" ADD COLUMN     "canEditHistoricalAttendance" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "public"."attendance_edits" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "previousStatus" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "editedById" TEXT,
    "editorRole" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_edits_employeeId_date_idx" ON "public"."attendance_edits"("employeeId", "date");

-- CreateIndex
CREATE INDEX "attendance_edits_date_idx" ON "public"."attendance_edits"("date");

-- CreateIndex
CREATE INDEX "attendance_edits_editedById_idx" ON "public"."attendance_edits"("editedById");

-- CreateIndex
CREATE INDEX "attendance_edits_createdAt_idx" ON "public"."attendance_edits"("createdAt");

-- AddForeignKey
ALTER TABLE "public"."attendance_edits" ADD CONSTRAINT "attendance_edits_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."attendance_edits" ADD CONSTRAINT "attendance_edits_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

