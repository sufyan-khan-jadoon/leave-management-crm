-- Curated job titles, assignable when issuing an invite key.

-- CreateTable
CREATE TABLE "public"."job_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_roles_name_key" ON "public"."job_roles"("name");

-- AlterTable
-- Nullable: a key may admit someone without deciding their title, leaving it to
-- profile setup. Existing keys therefore need no backfill.
ALTER TABLE "public"."invite_keys" ADD COLUMN "jobRoleId" TEXT;

-- AddForeignKey
-- SET NULL rather than CASCADE: deleting a job title must not delete the keys
-- that referenced it, nor the record of who was invited with them.
ALTER TABLE "public"."invite_keys" ADD CONSTRAINT "invite_keys_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "public"."job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
