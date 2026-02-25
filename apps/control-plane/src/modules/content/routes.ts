import type { FastifyPluginAsync } from 'fastify';
import type { ContentPost, ContentPostKind, ContentPostStatus, Prisma } from '@prisma/client';

import { z } from 'zod';

import { prisma } from '../../lib/prisma.js';

const postKindSchema = z.enum(['blog', 'news']);
const postStatusSchema = z.enum(['draft', 'published', 'archived']);

const publicListQuerySchema = z.object({
  kind: z.enum(['all', 'blog', 'news']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

const adminListQuerySchema = z.object({
  kind: z.enum(['all', 'blog', 'news']).default('all'),
  status: z.enum(['all', 'draft', 'published', 'archived']).default('all'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

const createPostSchema = z.object({
  title: z.string().trim().min(3).max(160),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(180)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  excerpt: z.string().trim().min(10).max(320),
  content: z.string().trim().min(40).max(100_000),
  kind: postKindSchema.default('blog'),
  status: postStatusSchema.default('draft'),
  publishedAt: z.string().datetime().optional(),
});

const updatePostSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    slug: z
      .string()
      .trim()
      .min(3)
      .max(180)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
    excerpt: z.string().trim().min(10).max(320).optional(),
    content: z.string().trim().min(40).max(100_000).optional(),
    kind: postKindSchema.optional(),
    status: postStatusSchema.optional(),
    publishedAt: z.union([z.string().datetime(), z.null()]).optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined
      || value.slug !== undefined
      || value.excerpt !== undefined
      || value.content !== undefined
      || value.kind !== undefined
      || value.status !== undefined
      || value.publishedAt !== undefined,
    { message: 'At least one field is required.' },
  );

const slugParamsSchema = z.object({
  slug: z.string().min(3).max(180).regex(/^[a-z0-9-]+$/),
});

const postIdParamsSchema = z.object({
  postId: z.string().cuid(),
});

const readTimeWordsPerMinute = 220;
const CONTENT_ADMIN_EMAIL_DOMAIN = '@apployd.com';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);

const asIso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

const estimateReadTimeMinutes = (content: string): number => {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  if (words <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(words / readTimeWordsPerMinute));
};

const parseDateOrNull = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const canManageContent = (email: string): boolean => {
  const normalized = email.trim().toLowerCase();
  return normalized.endsWith(CONTENT_ADMIN_EMAIL_DOMAIN) && normalized.length > CONTENT_ADMIN_EMAIL_DOMAIN.length;
};

const formatPostResponse = (post: ContentPost & { author: { name: string | null; email: string } }) => ({
  id: post.id,
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  content: post.content,
  kind: post.kind,
  status: post.status,
  publishedAt: asIso(post.publishedAt),
  createdAt: asIso(post.createdAt),
  updatedAt: asIso(post.updatedAt),
  readTimeMinutes: estimateReadTimeMinutes(post.content),
  author: {
    name: post.author.name,
    email: post.author.email,
  },
});

const ensureUniqueSlug = async (candidateSlug: string, ignorePostId?: string): Promise<string> => {
  const baseSlug = slugify(candidateSlug) || `post-${Date.now().toString(36)}`;
  let suffix = 1;
  let currentSlug = baseSlug;

  while (true) {
    const existing = await prisma.contentPost.findUnique({
      where: { slug: currentSlug },
      select: { id: true },
    });

    if (!existing || existing.id === ignorePostId) {
      return currentSlug;
    }

    suffix += 1;
    const suffixLabel = `-${suffix}`;
    const trimmedBase = baseSlug.slice(0, Math.max(1, 180 - suffixLabel.length));
    currentSlug = `${trimmedBase}${suffixLabel}`;
  }
};

const resolveCreatePublishedAt = (status: ContentPostStatus, publishedAtInput?: string): Date | null => {
  if (status !== 'published') {
    return null;
  }
  const provided = parseDateOrNull(publishedAtInput);
  return provided ?? new Date();
};

const buildPublicWhere = (kind: 'all' | ContentPostKind): Prisma.ContentPostWhereInput => {
  const where: Prisma.ContentPostWhereInput = {
    status: 'published',
    publishedAt: { lte: new Date() },
  };
  if (kind !== 'all') {
    where.kind = kind;
  }
  return where;
};

export const contentRoutes: FastifyPluginAsync = async (app) => {
  app.get('/content/posts', async (request) => {
    const query = publicListQuerySchema.parse(request.query);
    const where = buildPublicWhere(query.kind);

    const posts = await prisma.contentPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit,
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      posts: posts.map(formatPostResponse),
    };
  });

  app.get('/content/posts/:slug', async (request, reply) => {
    const params = slugParamsSchema.parse(request.params);

    const post = await prisma.contentPost.findFirst({
      where: {
        slug: params.slug,
        ...buildPublicWhere('all'),
      },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!post) {
      return reply.notFound('Post not found.');
    }

    return { post: formatPostResponse(post) };
  });

  app.get('/content/admin/posts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    if (!canManageContent(user.email)) {
      return reply.forbidden('Only @apployd.com accounts can manage blog content.');
    }
    const query = adminListQuerySchema.parse(request.query);

    const where: Prisma.ContentPostWhereInput = {};
    if (query.kind !== 'all') {
      where.kind = query.kind;
    }
    if (query.status !== 'all') {
      where.status = query.status;
    }

    const posts = await prisma.contentPost.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: query.limit,
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      posts: posts.map(formatPostResponse),
    };
  });

  app.post('/content/admin/posts', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    if (!canManageContent(user.email)) {
      return reply.forbidden('Only @apployd.com accounts can manage blog content.');
    }
    const body = createPostSchema.parse(request.body);

    const slug = await ensureUniqueSlug(body.slug ?? body.title);
    const publishedAt = resolveCreatePublishedAt(body.status, body.publishedAt);

    const post = await prisma.contentPost.create({
      data: {
        title: body.title,
        slug,
        excerpt: body.excerpt,
        content: body.content,
        kind: body.kind,
        status: body.status,
        publishedAt,
        authorId: user.userId,
      },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return reply.code(201).send({ post: formatPostResponse(post) });
  });

  app.patch('/content/admin/posts/:postId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = request.user as { userId: string; email: string };
    if (!canManageContent(user.email)) {
      return reply.forbidden('Only @apployd.com accounts can manage blog content.');
    }
    const params = postIdParamsSchema.parse(request.params);
    const body = updatePostSchema.parse(request.body);

    const existing = await prisma.contentPost.findUnique({
      where: { id: params.postId },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!existing) {
      return reply.notFound('Post not found.');
    }

    const nextSlug = body.slug !== undefined
      ? await ensureUniqueSlug(body.slug, existing.id)
      : existing.slug;

    const nextStatus = body.status ?? existing.status;
    let nextPublishedAt = existing.publishedAt;

    if (body.publishedAt !== undefined) {
      nextPublishedAt = parseDateOrNull(body.publishedAt);
    }

    if (body.status !== undefined) {
      if (body.status === 'published' && !nextPublishedAt) {
        nextPublishedAt = new Date();
      }
      if (body.status === 'draft') {
        nextPublishedAt = null;
      }
    }

    const updated = await prisma.contentPost.update({
      where: { id: existing.id },
      data: {
        title: body.title ?? existing.title,
        slug: nextSlug,
        excerpt: body.excerpt ?? existing.excerpt,
        content: body.content ?? existing.content,
        kind: body.kind ?? existing.kind,
        status: nextStatus,
        publishedAt: nextPublishedAt,
      },
      include: {
        author: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    return { post: formatPostResponse(updated) };
  });
};
