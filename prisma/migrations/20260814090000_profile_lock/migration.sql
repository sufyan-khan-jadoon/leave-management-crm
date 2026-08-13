-- Freezing an employee's own profile edits.
--
-- Deliberately not a new EmployeeStatus: suspending stops somebody signing in
-- at all, while this stops nothing but their own editing. A locked employee
-- signs in, marks attendance, books leave and is counted in every figure
-- exactly as before. The two are not points on one ladder, so they are not one
-- column.
--
-- Null means unlocked. A timestamp rather than a boolean so the screens can say
-- when, which is the first thing somebody asks on finding a frozen form.
ALTER TABLE "public"."employees" ADD COLUMN "profileLockedAt" TIMESTAMP(3);
ALTER TABLE "public"."employees" ADD COLUMN "profileLockedById" TEXT;
ALTER TABLE "public"."employees" ADD COLUMN "profileLockReason" TEXT;

CREATE INDEX "employees_profileLockedById_idx" ON "public"."employees"("profileLockedById");

-- SET NULL, not CASCADE: removing the administrator who set a lock must not
-- remove the lock, nor the person it was about.
ALTER TABLE "public"."employees"
  ADD CONSTRAINT "employees_profileLockedById_fkey"
  FOREIGN KEY ("profileLockedById") REFERENCES "public"."employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
