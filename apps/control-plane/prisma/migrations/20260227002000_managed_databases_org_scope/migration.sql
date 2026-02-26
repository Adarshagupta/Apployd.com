ALTER TABLE "managed_databases"
ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

UPDATE "managed_databases" AS md
SET "organizationId" = p."organizationId"
FROM "projects" AS p
WHERE md."organizationId" IS NULL
  AND md."projectId" = p."id";

ALTER TABLE "managed_databases"
ALTER COLUMN "organizationId" SET NOT NULL;

ALTER TABLE "managed_databases"
ALTER COLUMN "projectId" DROP NOT NULL;

ALTER TABLE "managed_databases"
DROP CONSTRAINT IF EXISTS "managed_databases_projectId_fkey";

ALTER TABLE "managed_databases"
ADD CONSTRAINT "managed_databases_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "projects"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "managed_databases"
ADD CONSTRAINT "managed_databases_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "managed_databases_organizationId_createdAt_idx"
ON "managed_databases"("organizationId", "createdAt");
