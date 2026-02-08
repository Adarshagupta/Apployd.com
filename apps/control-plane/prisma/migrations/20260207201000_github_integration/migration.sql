ALTER TABLE "projects"
ADD COLUMN IF NOT EXISTS "gitProvider" TEXT,
ADD COLUMN IF NOT EXISTS "repoOwner" TEXT,
ADD COLUMN IF NOT EXISTS "repoName" TEXT,
ADD COLUMN IF NOT EXISTS "repoFullName" TEXT,
ADD COLUMN IF NOT EXISTS "installCommand" TEXT,
ADD COLUMN IF NOT EXISTS "buildCommand" TEXT,
ADD COLUMN IF NOT EXISTS "startCommand" TEXT,
ADD COLUMN IF NOT EXISTS "rootDirectory" TEXT,
ADD COLUMN IF NOT EXISTS "autoDeployEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "previewDeploymentsEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "projects_organizationId_repoFullName_idx"
ON "projects"("organizationId", "repoFullName");

CREATE TABLE IF NOT EXISTS "github_connections" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "githubUserId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "avatarUrl" TEXT,
  "tokenScope" TEXT,
  "encryptedAccessToken" TEXT NOT NULL,
  "iv" TEXT NOT NULL,
  "authTag" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "github_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "github_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "github_connections_userId_key"
ON "github_connections"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "github_connections_githubUserId_key"
ON "github_connections"("githubUserId");

CREATE INDEX IF NOT EXISTS "github_connections_username_idx"
ON "github_connections"("username");
