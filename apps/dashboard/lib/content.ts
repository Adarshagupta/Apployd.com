import { siteUrl } from './seo';

const LOCAL_API_FALLBACK = 'http://localhost:4000/api/v1';
const API_PATH_FALLBACK = '/api/v1';
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

export type ContentPostKind = 'blog' | 'news';
export type ContentPostStatus = 'draft' | 'published' | 'archived';

export interface ContentPostRecord {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  kind: ContentPostKind;
  status: ContentPostStatus;
  publishedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  readTimeMinutes: number;
  author: {
    name: string | null;
    email: string;
  };
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const resolveServerApiUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return trimTrailingSlash(process.env.NEXT_PUBLIC_API_URL);
  }
  if (process.env.API_URL) {
    return trimTrailingSlash(process.env.API_URL);
  }
  if (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL) {
    return `${trimTrailingSlash(siteUrl)}${API_PATH_FALLBACK}`;
  }
  return LOCAL_API_FALLBACK;
};

const toAbsoluteApiBase = (value: string): string => {
  if (/^https?:\/\//i.test(value)) {
    return trimTrailingSlash(value);
  }
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return `${trimTrailingSlash(siteUrl)}${normalized}`;
};

const parsePosts = (payload: unknown): ContentPostRecord[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const posts = (payload as { posts?: unknown }).posts;
  if (!Array.isArray(posts)) {
    return [];
  }
  return posts as ContentPostRecord[];
};

const parsePost = (payload: unknown): ContentPostRecord | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const post = (payload as { post?: unknown }).post;
  if (!post || typeof post !== 'object') {
    return null;
  }
  return post as ContentPostRecord;
};

const toAbsoluteUrl = (path: string): string => `${toAbsoluteApiBase(resolveServerApiUrl())}${path}`;

async function fetchContentPayload(
  path: string,
  options?: {
    revalidateSeconds?: number | undefined;
    timeoutMs?: number | undefined;
  },
): Promise<unknown | null> {
  const revalidateSeconds = options?.revalidateSeconds ?? 180;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(toAbsoluteUrl(path), {
      next: { revalidate: revalidateSeconds },
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchPublishedContentPosts(options?: {
  kind?: 'all' | ContentPostKind;
  limit?: number;
  revalidateSeconds?: number | undefined;
  timeoutMs?: number | undefined;
}): Promise<ContentPostRecord[]> {
  const kind = options?.kind ?? 'all';
  const limit = options?.limit ?? 48;
  const query = new URLSearchParams({
    kind,
    limit: String(limit),
  });

  const payload = await fetchContentPayload(`/content/posts?${query.toString()}`, {
    revalidateSeconds: options?.revalidateSeconds,
    timeoutMs: options?.timeoutMs,
  });

  if (!payload) {
    return [];
  }

  return parsePosts(payload);
}

export async function fetchPublishedContentPostBySlug(
  slug: string,
  options?: { revalidateSeconds?: number | undefined; timeoutMs?: number | undefined },
): Promise<ContentPostRecord | null> {
  const cleanSlug = slug.trim().toLowerCase();
  if (!cleanSlug) {
    return null;
  }

  const payload = await fetchContentPayload(`/content/posts/${encodeURIComponent(cleanSlug)}`, {
    revalidateSeconds: options?.revalidateSeconds,
    timeoutMs: options?.timeoutMs,
  });

  if (!payload) {
    return null;
  }

  return parsePost(payload);
}

export const toContentCanonicalPath = (slug: string): string => `/blog/${slug}`;

export const toContentAbsoluteUrl = (slug: string): string => `${siteUrl}${toContentCanonicalPath(slug)}`;
