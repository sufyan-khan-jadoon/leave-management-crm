-- Invite keys gain a role, so the same mechanism can onboard employees as well
-- as administrators.
--
-- Written by hand rather than generated: `prisma migrate` renders a model rename
-- as DROP + CREATE, which would discard every key already issued. Renaming in
-- place keeps live keys — and the accounts that redeemed them — intact.

-- Table. Postgres carries indexes and constraints across a rename automatically,
-- but they keep their old names, so each is renamed too. Leaving them would work
-- at runtime and then read as drift the next time a migration is generated.
ALTER TABLE "public"."admin_invite_keys" RENAME TO "invite_keys";

-- The primary key and the foreign keys are constraints, so they are renamed as
-- constraints. The two uniques and the lookup index were created as plain
-- indexes by the previous migration, so those go through ALTER INDEX.
ALTER TABLE "public"."invite_keys" RENAME CONSTRAINT "admin_invite_keys_pkey" TO "invite_keys_pkey";
ALTER TABLE "public"."invite_keys" RENAME CONSTRAINT "admin_invite_keys_issuedById_fkey" TO "invite_keys_issuedById_fkey";
ALTER TABLE "public"."invite_keys" RENAME CONSTRAINT "admin_invite_keys_redeemedById_fkey" TO "invite_keys_redeemedById_fkey";

ALTER INDEX "public"."admin_invite_keys_key_key" RENAME TO "invite_keys_key_key";
ALTER INDEX "public"."admin_invite_keys_redeemedById_key" RENAME TO "invite_keys_redeemedById_key";
ALTER INDEX "public"."admin_invite_keys_issuedById_createdAt_idx" RENAME TO "invite_keys_issuedById_createdAt_idx";

-- Role. Added with a default so existing rows backfill correctly — every key
-- that predates this migration was an administrator invite — then the default is
-- dropped, because from here on the issuer must state the role explicitly.
ALTER TABLE "public"."invite_keys" ADD COLUMN "role" "public"."Role" NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "public"."invite_keys" ALTER COLUMN "role" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "invite_keys_role_createdAt_idx" ON "public"."invite_keys"("role", "createdAt");
