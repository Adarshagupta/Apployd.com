CREATE TYPE "ContentPostKind" AS ENUM ('blog', 'news');

CREATE TYPE "ContentPostStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "content_posts" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "kind" "ContentPostKind" NOT NULL DEFAULT 'blog'::"ContentPostKind",
  "status" "ContentPostStatus" NOT NULL DEFAULT 'draft'::"ContentPostStatus",
  "publishedAt" TIMESTAMP(3),
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_posts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_posts_slug_key" ON "content_posts"("slug");
CREATE INDEX "content_posts_status_publishedAt_idx" ON "content_posts"("status", "publishedAt");
CREATE INDEX "content_posts_kind_publishedAt_idx" ON "content_posts"("kind", "publishedAt");
CREATE INDEX "content_posts_createdAt_idx" ON "content_posts"("createdAt");

ALTER TABLE "content_posts"
  ADD CONSTRAINT "content_posts_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
