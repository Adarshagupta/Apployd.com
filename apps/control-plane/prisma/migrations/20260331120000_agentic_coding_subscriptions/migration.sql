CREATE TABLE IF NOT EXISTS "agent_subscriptions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "planCode" TEXT NOT NULL,
  "stripeCustomerId" TEXT NOT NULL,
  "stripeSubscriptionId" TEXT,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'incomplete',
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_subscriptions_organizationId_fkey"
    FOREIGN KEY ("organizationId")
    REFERENCES "organizations"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_subscriptions_stripeSubscriptionId_key"
ON "agent_subscriptions"("stripeSubscriptionId");

CREATE INDEX IF NOT EXISTS "agent_subscriptions_organizationId_status_idx"
ON "agent_subscriptions"("organizationId", "status");

CREATE INDEX IF NOT EXISTS "agent_subscriptions_organizationId_createdAt_idx"
ON "agent_subscriptions"("organizationId", "createdAt");
