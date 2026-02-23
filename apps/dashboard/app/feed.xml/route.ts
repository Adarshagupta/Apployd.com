import { blogPosts } from '../(marketing)/blog/posts';
import { siteUrl } from '../../lib/seo';

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export async function GET() {
  const items = blogPosts
    .map((post) => {
      const url = `${siteUrl}/blog#${post.slug}`;
      return [
        '<item>',
        `<title>${escapeXml(post.title)}</title>`,
        `<description>${escapeXml(post.excerpt)}</description>`,
        `<link>${escapeXml(url)}</link>`,
        `<guid isPermaLink="false">${escapeXml(post.slug)}</guid>`,
        `<pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>`,
        '</item>',
      ].join('');
    })
    .join('');

  const latestPublishedAt = blogPosts
    .map((post) => new Date(post.publishedAt).getTime())
    .sort((a, b) => b - a)[0] ?? Date.now();

  const rss = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    '<channel>',
    '<title>Apployd Blog</title>',
    `<link>${escapeXml(`${siteUrl}/blog`)}</link>`,
    '<description>Engineering deep-dives, product updates, and security practices from the Apployd team.</description>',
    '<language>en-US</language>',
    `<lastBuildDate>${new Date(latestPublishedAt).toUTCString()}</lastBuildDate>`,
    items,
    '</channel>',
    '</rss>',
  ].join('');

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
