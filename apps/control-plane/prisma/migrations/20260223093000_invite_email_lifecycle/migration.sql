CREATE TYPE "InviteEmailStatus" AS ENUM (
  'not_sent',
  'sent',
  'failed',
  'bounced',
  'complained'
);

CREATE TYPE "InviteEmailEventType" AS ENUM (
  'invite_sent',
  'invite_send_failed',
  'invite_resent',
  'invite_resend_failed',
  'invite_reminder_sent',
  'invite_reminder_failed',
  'bounced',
  'complained',
  'auto_expired'
);

ALTER TABLE "organization_invites"
  ADD COLUMN "emailDeliveryStatus" "InviteEmailStatus" NOT NULL DEFAULT 'not_sent'::"InviteEmailStatus",
  ADD COLUMN "lastEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "lastDeliveryError" TEXT,
  ADD COLUMN "lastReminderSentAt" TIMESTAMP(3),
  ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "bouncedAt" TIMESTAMP(3),
  ADD COLUMN "complainedAt" TIMESTAMP(3);

CREATE INDEX "organization_invites_organizationId_emailDeliveryStatus_expiresAt_idx"
  ON "organization_invites"("organizationId", "emailDeliveryStatus", "expiresAt");

CREATE TABLE "organization_invite_email_events" (
  "id" TEXT NOT NULL,
  "inviteId" TEXT NOT NULL,
  "eventType" "InviteEmailEventType" NOT NULL,
  "provider" TEXT,
  "providerEventId" TEXT,
  "message" TEXT,
  "metadata" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_invite_email_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_invite_email_events_inviteId_occurredAt_idx"
  ON "organization_invite_email_events"("inviteId", "occurredAt");

CREATE INDEX "organization_invite_email_events_provider_providerEventId_idx"
  ON "organization_invite_email_events"("provider", "providerEventId");

ALTER TABLE "organization_invite_email_events"
  ADD CONSTRAINT "organization_invite_email_events_inviteId_fkey"
  FOREIGN KEY ("inviteId") REFERENCES "organization_invites"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
