CREATE TABLE IF NOT EXISTS "managed_databases" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'neon',
  "status" TEXT NOT NULL DEFAULT 'ready',
  "name" TEXT NOT NULL,
  "regionId" TEXT NOT NULL,
  "branchName" TEXT NOT NULL,
  "databaseName" TEXT NOT NULL,
  "roleName" TEXT NOT NULL,
  "secretKey" TEXT NOT NULL DEFAULT 'DATABASE_URL',
  "externalProjectId" TEXT NOT NULL,
  "externalBranchId" TEXT NOT NULL,
  "externalEndpointId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "managed_databases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "managed_databases_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "managed_databases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "managed_databases_projectId_createdAt_idx"
ON "managed_databases"("projectId", "createdAt");

CREATE INDEX IF NOT EXISTS "managed_databases_createdById_createdAt_idx"
ON "managed_databases"("createdById", "createdAt");

CREATE INDEX IF NOT EXISTS "managed_databases_provider_externalProjectId_idx"
ON "managed_databases"("provider", "externalProjectId");
