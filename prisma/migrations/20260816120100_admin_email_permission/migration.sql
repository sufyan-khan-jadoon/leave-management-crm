-- Per-administrator permission to write to the other administrators.
--
-- The sixth delegable right. It unlocks two audiences — every administrator at
-- once, and a hand-picked set — and widens the one-person picker, which without
-- it offers employees only.
--
-- Defaults to false, including for administrators who already exist, and that is
-- the migration's only interesting decision. `canSendEmails` previously let an
-- administrator reach a colleague through the INDIVIDUAL audience, so this
-- narrows what an existing grant buys rather than only adding to it. Copying
-- `canSendEmails` across would have preserved that reach *and* handed the two new
-- group audiences to everybody who held the old grant — which is exactly the
-- "do not give every admin this capability automatically" that the right exists
-- to prevent. Whoever should keep it is granted it deliberately, from Access.
ALTER TABLE "public"."employees" ADD COLUMN "canEmailAdmins" BOOLEAN NOT NULL DEFAULT false;

-- Who a hand-picked message actually went to, by name.
--
-- Empty for every other audience, and empty for every row that predates this:
-- the others are a population the role decides, so the audience and the count
-- already describe them completely.
ALTER TABLE "public"."email_dispatches" ADD COLUMN "recipientNames" TEXT[] DEFAULT ARRAY[]::TEXT[];
