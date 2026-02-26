CREATE TABLE IF NOT EXISTS "vercel_connections" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "vercelUserId" TEXT NOT NULL,
  "username" TEXT,
  "email" TEXT,
  "avatarUrl" TEXT,
  "tokenScope" TEXT,
  "encryptedAccessToken" TEXT NOT NULL,
  "accessTokenIv" TEXT NOT NULL,
  "accessTokenAuthTag" TEXT NOT NULL,
  "encryptedRefreshToken" TEXT,
  "refreshTokenIv" TEXT,
  "refreshTokenAuthTag" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "vercel_connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vercel_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "vercel_connections_userId_key"
ON "vercel_connections"("userId");

CREATE UNIQUE INDEX IF NOT EXISTS "vercel_connections_vercelUserId_key"
ON "vercel_connections"("vercelUserId");

CREATE INDEX IF NOT EXISTS "vercel_connections_username_idx"
ON "vercel_connections"("username");

CREATE INDEX IF NOT EXISTS "vercel_connections_accessTokenExpiresAt_idx"
ON "vercel_connections"("accessTokenExpiresAt");
