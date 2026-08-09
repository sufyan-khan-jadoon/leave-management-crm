-- Custom emails: the super admin (and administrators they allow) writing to people here.
--
-- One column and one table. `canSendEmails` is the third delegable right and
-- follows the two before it exactly — off by default, read from the row on every
-- send rather than carried in a session. The table is an audit record: who wrote,
-- to whom, how many, when, and whether it arrived.
--
-- The message body is deliberately absent. The log answers "who wrote to the
-- organisation and did it land", and storing the text would turn that into a copy
-- of everybody's mail.

-- AlterTable
ALTER TABLE "public"."employees" ADD COLUMN "canSendEmails" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "public"."EmailAudience" AS ENUM ('INDIVIDUAL', 'EMPLOYEES', 'ADMINS', 'ALL_MEMBERS');

-- CreateEnum
CREATE TYPE "public"."EmailDispatchStatus" AS ENUM ('SENT', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "public"."email_dispatches" (
    "id" TEXT NOT NULL,
    "audience" "public"."EmailAudience" NOT NULL,
    "subject" TEXT NOT NULL,
    -- Addresses resolved, and addresses the mailer accepted. Both, because
    -- "sent to 40, delivered 38" is the useful reading and one number cannot say it.
    "recipientCount" INTEGER NOT NULL,
    "deliveredCount" INTEGER NOT NULL,
    "status" "public"."EmailDispatchStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "senderId" TEXT NOT NULL,
    -- Only meaningful for INDIVIDUAL sends.
    "recipientId" TEXT,

    CONSTRAINT "email_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_dispatches_senderId_createdAt_idx" ON "public"."email_dispatches"("senderId", "createdAt");

-- CreateIndex
CREATE INDEX "email_dispatches_createdAt_idx" ON "public"."email_dispatches"("createdAt");

-- AddForeignKey
-- Restricted: deleting an administrator must not erase the record of what they
-- sent to the whole company.
ALTER TABLE "public"."email_dispatches" ADD CONSTRAINT "email_dispatches_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "public"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
-- Nulled rather than cascading: the send still happened, and the count still says one.
ALTER TABLE "public"."email_dispatches" ADD CONSTRAINT "email_dispatches_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
