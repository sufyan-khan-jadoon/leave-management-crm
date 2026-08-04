-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."EmployeeStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "public"."EmployeeStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'SUPER_ADMIN';

-- CreateTable
CREATE TABLE "public"."admin_invite_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT NOT NULL,
    "redeemedById" TEXT,

    CONSTRAINT "admin_invite_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_invite_keys_key_key" ON "public"."admin_invite_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invite_keys_redeemedById_key" ON "public"."admin_invite_keys"("redeemedById");

-- CreateIndex
CREATE INDEX "admin_invite_keys_issuedById_createdAt_idx" ON "public"."admin_invite_keys"("issuedById", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."admin_invite_keys" ADD CONSTRAINT "admin_invite_keys_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admin_invite_keys" ADD CONSTRAINT "admin_invite_keys_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

