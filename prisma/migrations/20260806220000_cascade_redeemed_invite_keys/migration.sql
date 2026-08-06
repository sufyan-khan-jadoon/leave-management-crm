-- Deleting an account now deletes the invite key it was created with.
--
-- The key records how one particular account came to exist, so once that account
-- is gone the key describes nothing. Under SET NULL it stayed behind as a "Used"
-- row pointing at nobody, which no screen offered any way to remove.
--
-- Only the rule changes here. Keys already orphaned by earlier deletions are
-- left in place deliberately — a migration is the wrong place to delete rows
-- nobody asked it to touch, and they can now be cleared from the invite panel,
-- which treats a redeemed key with no surviving account as removable.
ALTER TABLE "public"."invite_keys" DROP CONSTRAINT "invite_keys_redeemedById_fkey";

ALTER TABLE "public"."invite_keys" ADD CONSTRAINT "invite_keys_redeemedById_fkey" FOREIGN KEY ("redeemedById") REFERENCES "public"."employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
