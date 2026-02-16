ALTER TABLE "users"
ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3),
ADD COLUMN "onboardingAnswers" JSONB;
