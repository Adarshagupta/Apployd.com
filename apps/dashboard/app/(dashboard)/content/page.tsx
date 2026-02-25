'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { SectionCard } from '../../../components/section-card';
import { apiClient } from '../../../lib/api';

type ContentPostKind = 'blog' | 'news';
type ContentPostStatus = 'draft' | 'published' | 'archived';

interface AdminContentPost {
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

interface EditorFormState {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  kind: ContentPostKind;
  status: ContentPostStatus;
  publishedAt: string;
}

const emptyForm: EditorFormState = {
  title: '',
  slug: '',
  excerpt: '',
  content: '',
  kind: 'blog',
  status: 'draft',
  publishedAt: '',
};

const toDateTimeInputValue = (iso: string | null | undefined): string => {
  if (!iso) {
    return '';
  }
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return '';
  }

  const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60_000));
  return local.toISOString().slice(0, 16);
};

const toIsoOrNull = (value: string): string | null => {
  const clean = value.trim();
  if (!clean) {
    return null;
  }

  const parsed = new Date(clean);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const formatDateTime = (iso: string | null): string => {
  if (!iso) {
    return '-';
  }
  const parsed = new Date(iso);
  if (!Number.isFinite(parsed.getTime())) {
    return '-';
  }
  return parsed.toLocaleString();
};

const toEditorForm = (post: AdminContentPost): EditorFormState => ({
  title: post.title,
  slug: post.slug,
  excerpt: post.excerpt,
  content: post.content,
  kind: post.kind,
  status: post.status,
  publishedAt: toDateTimeInputValue(post.publishedAt),
});

export default function ContentAdminPage() {
  const [posts, setPosts] = useState<AdminContentPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [form, setForm] = useState<EditorFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | ContentPostKind>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | ContentPostStatus>('all');

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedPostId) ?? null,
    [posts, selectedPostId],
  );

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({
        limit: '120',
        kind: filterKind,
        status: filterStatus,
      });
      const data = (await apiClient.get(`/content/admin/posts?${query.toString()}`)) as {
        posts?: AdminContentPost[];
      };

      const nextPosts = data.posts ?? [];
      setPosts(nextPosts);
      setSelectedPostId((current) => {
        if (current && nextPosts.some((post) => post.id === current)) {
          return current;
        }
        return nextPosts[0]?.id ?? null;
      });
      setMessage('');
    } catch (error) {
      setMessage((error as Error).message);
      setPosts([]);
      setSelectedPostId(null);
    } finally {
      setLoading(false);
    }
  }, [filterKind, filterStatus]);

  useEffect(() => {
    loadPosts().catch(() => undefined);
  }, [loadPosts]);

  useEffect(() => {
    if (selectedPost) {
      setForm(toEditorForm(selectedPost));
      return;
    }
    setForm(emptyForm);
  }, [selectedPost]);

  const handleNew = () => {
    setSelectedPostId(null);
    setForm(emptyForm);
    setMessage('Creating a new post.');
  };

  const handleSave = async () => {
    const title = form.title.trim();
    const excerpt = form.excerpt.trim();
    const content = form.content.trim();
    const slug = form.slug.trim();
    const publishedAtIso = toIsoOrNull(form.publishedAt);

    if (!title || !excerpt || !content) {
      setMessage('Title, excerpt, and content are required.');
      return;
    }

    if (form.publishedAt.trim() && !publishedAtIso) {
      setMessage('Published date is invalid.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title,
        excerpt,
        content,
        kind: form.kind,
        status: form.status,
        ...(slug ? { slug } : {}),
        publishedAt: publishedAtIso,
      };

      if (selectedPostId) {
        const response = (await apiClient.patch(`/content/admin/posts/${selectedPostId}`, payload)) as {
          post?: AdminContentPost;
        };
        setMessage('Post updated.');
        await loadPosts();
        if (response.post?.id) {
          setSelectedPostId(response.post.id);
        }
      } else {
        const response = (await apiClient.post('/content/admin/posts', payload)) as {
          post?: AdminContentPost;
        };
        setMessage('Post created.');
        await loadPosts();
        if (response.post?.id) {
          setSelectedPostId(response.post.id);
        }
      }
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const liveSlug = selectedPost?.slug ?? '';
  const liveUrl = liveSlug ? `/blog/${liveSlug}` : '';

  return (
    <div className="space-y-4">
      <SectionCard title="Content Studio" subtitle="Write, edit, and publish blogs or news posts.">
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="field-label">Type</span>
            <select
              className="field-input"
              value={filterKind}
              onChange={(event) => setFilterKind(event.target.value as 'all' | ContentPostKind)}
            >
              <option value="all">all</option>
              <option value="blog">blog</option>
              <option value="news">news</option>
            </select>
          </label>
          <label>
            <span className="field-label">Status</span>
            <select
              className="field-input"
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value as 'all' | ContentPostStatus)}
            >
              <option value="all">all</option>
              <option value="draft">draft</option>
              <option value="published">published</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <button className="btn-secondary" onClick={() => loadPosts().catch(() => undefined)} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="btn-primary" onClick={handleNew}>
            New Post
          </button>
        </div>
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <SectionCard title="Posts" subtitle="Select an existing post to edit.">
          <div className="space-y-2">
            {posts.length ? (
              posts.map((post) => {
                const selected = post.id === selectedPostId;
                return (
                  <button
                    key={post.id}
                    type="button"
                    className={`w-full rounded-xl border p-3 text-left transition ${selected ? 'border-slate-500 bg-slate-100/70' : 'border-slate-200 bg-white'}`}
                    onClick={() => setSelectedPostId(post.id)}
                  >
                    <p className="truncate text-sm font-semibold text-slate-900">{post.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.1em] text-slate-600">
                      {post.kind} | {post.status}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Updated {formatDateTime(post.updatedAt)}
                    </p>
                  </button>
                );
              })
            ) : (
              <p className="text-sm text-slate-600">
                {loading ? 'Loading posts...' : 'No posts found for this filter.'}
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title={selectedPost ? 'Edit Post' : 'New Post'} subtitle="Blogs and news both publish to /blog.">
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="field-label">Title</span>
              <input
                className="field-input"
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="Post title"
              />
            </label>
            <label>
              <span className="field-label">Slug</span>
              <input
                className="field-input"
                value={form.slug}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value.toLowerCase() }))}
                placeholder="slug-auto-generated-if-empty"
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label>
              <span className="field-label">Type</span>
              <select
                className="field-input"
                value={form.kind}
                onChange={(event) => setForm((prev) => ({ ...prev, kind: event.target.value as ContentPostKind }))}
              >
                <option value="blog">blog</option>
                <option value="news">news</option>
              </select>
            </label>

            <label>
              <span className="field-label">Status</span>
              <select
                className="field-input"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as ContentPostStatus }))}
              >
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </select>
            </label>

            <label>
              <span className="field-label">Publish Time</span>
              <input
                type="datetime-local"
                className="field-input"
                value={form.publishedAt}
                onChange={(event) => setForm((prev) => ({ ...prev, publishedAt: event.target.value }))}
              />
            </label>
          </div>

          <label className="mt-3 block">
            <span className="field-label">Excerpt</span>
            <textarea
              className="field-input min-h-[92px]"
              value={form.excerpt}
              onChange={(event) => setForm((prev) => ({ ...prev, excerpt: event.target.value }))}
              placeholder="Short summary shown in blog listing."
            />
          </label>

          <label className="mt-3 block">
            <span className="field-label">Content</span>
            <textarea
              className="field-input min-h-[320px]"
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              placeholder="Write full article body here."
            />
          </label>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : selectedPost ? 'Save Changes' : 'Create Post'}
            </button>
            <button
              className="btn-secondary"
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  status: 'published',
                  publishedAt: toDateTimeInputValue(new Date().toISOString()),
                }))
              }
            >
              Set Publish Now
            </button>
            {liveUrl ? (
              <a className="btn-secondary" href={liveUrl} target="_blank" rel="noreferrer">
                Open Live
              </a>
            ) : null}
          </div>

          {selectedPost ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>Author: {selectedPost.author.name ?? selectedPost.author.email}</p>
              <p>Created: {formatDateTime(selectedPost.createdAt)}</p>
              <p>Updated: {formatDateTime(selectedPost.updatedAt)}</p>
              <p>Estimated read time: {selectedPost.readTimeMinutes} min</p>
            </div>
          ) : null}
        </SectionCard>
      </div>

      {message ? (
        <SectionCard title="Status">
          <p className="text-sm text-slate-700">{message}</p>
        </SectionCard>
      ) : null}
    </div>
  );
}
