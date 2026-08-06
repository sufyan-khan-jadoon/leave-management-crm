-- Per-administrator permission to issue employee invite keys.
--
-- Defaults to false, including for administrators who already exist: the right
-- to onboard people is granted deliberately by the super admin, so nobody
-- acquires it simply by having been an admin before this migration ran.
ALTER TABLE "public"."employees" ADD COLUMN "canInviteEmployees" BOOLEAN NOT NULL DEFAULT false;
