-- An optional explanation on a historical attendance correction.
--
-- Nullable with no default and no backfill: every row written before this
-- existed was a one-click correction that genuinely had nothing said about it,
-- and inventing a sentence for it would put words into an audit trail somebody
-- reads as a record of what was actually stated.
ALTER TABLE "attendance_edits" ADD COLUMN "note" TEXT;
