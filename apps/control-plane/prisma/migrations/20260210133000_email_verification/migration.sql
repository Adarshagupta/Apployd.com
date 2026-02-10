ALTER TABLE "users"
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "users"
SET "emailVerifiedAt" = NOW()
WHERE "emailVerifiedAt" IS NULL;
