-- Invite keys are replaced by invitations addressed to an email address.
--
-- Nothing is migrated across. A key was an anonymous bearer token — it recorded
-- no address, so there is no way to derive who an outstanding one was meant for,
-- and inventing an address to send an invitation to would be worse than asking
-- the administrator to invite that person again. Keys already redeemed carry no
-- state the account does not: `role` and `position` were copied onto the
-- employee row at sign-up, which is why dropping this table leaves every
-- existing account, leave record and job title untouched.

-- CreateEnum
CREATE TYPE "public"."InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED');

-- CreateTable
CREATE TABLE "public"."invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL,
    "jobRoleId" TEXT,
    "status" "public"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT NOT NULL,
    "acceptedById" TEXT,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- One row per address, so "already invited" is refused by the database rather
-- than only by the service that checked a moment earlier.
CREATE UNIQUE INDEX "invitations_email_key" ON "public"."invitations"("email");
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "public"."invitations"("tokenHash");
CREATE UNIQUE INDEX "invitations_acceptedById_key" ON "public"."invitations"("acceptedById");
CREATE INDEX "invitations_invitedById_createdAt_idx" ON "public"."invitations"("invitedById", "createdAt");
CREATE INDEX "invitations_role_createdAt_idx" ON "public"."invitations"("role", "createdAt");

-- AddForeignKey
-- SET NULL on the job title: deleting a title must not delete the invitations
-- that referenced it, nor the record of who was invited with them.
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "public"."job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropTable
-- Last, so the statements above have already succeeded before anything is lost.
DROP TABLE "public"."invite_keys";
