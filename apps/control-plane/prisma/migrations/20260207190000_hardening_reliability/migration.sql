ALTER TABLE "deployments"
ADD COLUMN IF NOT EXISTS "capacityReserved" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "webhook_events" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_provider_eventId_key"
ON "webhook_events"("provider", "eventId");

CREATE INDEX IF NOT EXISTS "webhook_events_provider_processedAt_idx"
ON "webhook_events"("provider", "processedAt");
