-- Migration: add_gradual_release
-- Adds percentage-based canary/gradual release support to Apployd.

-- ─── Deployment: canary tracking fields ───────────────────────────────────────
ALTER TABLE "deployments"
  ADD COLUMN "isCanary"         BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN "canaryStartedAt"  TIMESTAMP(3),
  ADD COLUMN "canaryPromotedAt" TIMESTAMP(3);

CREATE INDEX "deployments_projectId_isCanary_idx"
  ON "deployments" ("projectId", "isCanary");

-- ─── Project: canary deployment pointer + traffic split % ─────────────────────
ALTER TABLE "projects"
  ADD COLUMN "canaryDeploymentId" TEXT,
  ADD COLUMN "canaryPercent"      INTEGER NOT NULL DEFAULT 0;

-- Foreign key: projects.canaryDeploymentId → deployments.id
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_canaryDeploymentId_fkey"
  FOREIGN KEY ("canaryDeploymentId")
  REFERENCES "deployments"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Unique constraint so only one canary can be active per project at a time
CREATE UNIQUE INDEX "projects_canaryDeploymentId_key"
  ON "projects" ("canaryDeploymentId");
