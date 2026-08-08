-- Locks an account out after too many consecutive failed sign-ins, until the
-- owner proves the mailbox again.
--
-- Existing accounts start at zero and unlocked: nobody is shut out by the
-- migration itself, and the count only ever describes failures observed since.
ALTER TABLE "public"."employees" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."employees" ADD COLUMN "lockedAt" TIMESTAMP(3);
