CREATE TYPE "SecurityIncidentStatus" AS ENUM ('open', 'appealed', 'reviewing', 'resolved', 'dismissed');

CREATE TYPE "SecurityAppealStatus" AS ENUM ('submitted', 'approved', 'rejected');

CREATE TABLE "security_incidents" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "deploymentId" TEXT,
  "containerId" TEXT,
  "category" TEXT NOT NULL DEFAULT 'runtime_abuse',
  "severity" TEXT NOT NULL DEFAULT 'high',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reasonCode" TEXT,
  "blocked" BOOLEAN NOT NULL DEFAULT true,
  "status" "SecurityIncidentStatus" NOT NULL DEFAULT 'open'::"SecurityIncidentStatus",
  "evidence" JSONB,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "blockedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "security_incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "security_incident_appeals" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "status" "SecurityAppealStatus" NOT NULL DEFAULT 'submitted'::"SecurityAppealStatus",
  "message" TEXT NOT NULL,
  "decidedById" TEXT,
  "decisionNote" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "security_incident_appeals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "security_incidents_organizationId_status_detectedAt_idx"
  ON "security_incidents"("organizationId", "status", "detectedAt");
CREATE INDEX "security_incidents_projectId_status_detectedAt_idx"
  ON "security_incidents"("projectId", "status", "detectedAt");
CREATE INDEX "security_incidents_deploymentId_detectedAt_idx"
  ON "security_incidents"("deploymentId", "detectedAt");
CREATE INDEX "security_incidents_containerId_detectedAt_idx"
  ON "security_incidents"("containerId", "detectedAt");

CREATE INDEX "security_incident_appeals_incidentId_createdAt_idx"
  ON "security_incident_appeals"("incidentId", "createdAt");
CREATE INDEX "security_incident_appeals_organizationId_status_createdAt_idx"
  ON "security_incident_appeals"("organizationId", "status", "createdAt");
CREATE INDEX "security_incident_appeals_projectId_status_createdAt_idx"
  ON "security_incident_appeals"("projectId", "status", "createdAt");

ALTER TABLE "security_incidents"
  ADD CONSTRAINT "security_incidents_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_incidents"
  ADD CONSTRAINT "security_incidents_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_incidents"
  ADD CONSTRAINT "security_incidents_deploymentId_fkey"
  FOREIGN KEY ("deploymentId") REFERENCES "deployments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_incidents"
  ADD CONSTRAINT "security_incidents_containerId_fkey"
  FOREIGN KEY ("containerId") REFERENCES "containers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_incidents"
  ADD CONSTRAINT "security_incidents_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "security_incident_appeals"
  ADD CONSTRAINT "security_incident_appeals_incidentId_fkey"
  FOREIGN KEY ("incidentId") REFERENCES "security_incidents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_incident_appeals"
  ADD CONSTRAINT "security_incident_appeals_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_incident_appeals"
  ADD CONSTRAINT "security_incident_appeals_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "security_incident_appeals"
  ADD CONSTRAINT "security_incident_appeals_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "security_incident_appeals"
  ADD CONSTRAINT "security_incident_appeals_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
