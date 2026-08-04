-- CreateEnum
CREATE TYPE "public"."OtpPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- DropIndex
DROP INDEX "public"."otp_codes_employeeId_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."otp_codes" ADD COLUMN     "purpose" "public"."OtpPurpose" NOT NULL DEFAULT 'EMAIL_VERIFICATION';

-- CreateIndex
CREATE INDEX "otp_codes_employeeId_purpose_createdAt_idx" ON "public"."otp_codes"("employeeId", "purpose", "createdAt");

