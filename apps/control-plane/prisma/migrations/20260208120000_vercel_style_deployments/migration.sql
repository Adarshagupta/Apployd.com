-- Add environment column to deployments (production vs preview)
ALTER TABLE "deployments" ADD COLUMN "environment" TEXT NOT NULL DEFAULT 'production';

-- Add activeDeploymentId to projects (currently promoted production deployment)
ALTER TABLE "projects" ADD COLUMN "activeDeploymentId" TEXT;
ALTER TABLE "projects" ADD CONSTRAINT "projects_activeDeploymentId_key" UNIQUE ("activeDeploymentId");
ALTER TABLE "projects" ADD CONSTRAINT "projects_activeDeploymentId_fkey"
  FOREIGN KEY ("activeDeploymentId") REFERENCES "deployments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for fast environment+status lookups per project
CREATE INDEX "deployments_projectId_environment_status_idx" ON "deployments"("projectId", "environment", "status");

-- Backfill: set the most recent ready deployment per project as the active one
UPDATE "projects" p
SET "activeDeploymentId" = (
  SELECT d.id FROM "deployments" d
  WHERE d."projectId" = p.id
    AND d."status" = 'ready'
    AND d."environment" = 'production'
  ORDER BY d."createdAt" DESC
  LIMIT 1
);
