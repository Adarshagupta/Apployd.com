export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  dateLabel: string;
  publishedAt: string;
  readTime: string;
};

export const blogPosts: BlogPost[] = [
  {
    slug: 'introducing-apployd-managed-deployments-for-saas-teams',
    title: 'Introducing Apployd - Managed Deployments for SaaS Teams',
    excerpt:
      "We built Apployd to give teams Vercel-style deploy UX with predictable SaaS pricing. Here's the story.",
    category: 'Product',
    dateLabel: 'Jan 28, 2026',
    publishedAt: '2026-01-28T00:00:00.000Z',
    readTime: '6 min read',
  },
  {
    slug: 'how-universal-dockerfiles-eliminated-our-build-matrix',
    title: 'How Universal Dockerfiles Eliminated Our Build Matrix',
    excerpt:
      'A single Dockerfile that auto-detects Node.js, Python, Go, Rust, and static sites. No configuration needed.',
    category: 'Engineering',
    dateLabel: 'Jan 22, 2026',
    publishedAt: '2026-01-22T00:00:00.000Z',
    readTime: '8 min read',
  },
  {
    slug: 'zero-downtime-deploys-with-rolling-container-swaps',
    title: 'Zero-Downtime Deploys with Rolling Container Swaps',
    excerpt:
      'Deep-dive into our health-check-driven rolling deployment strategy that keeps your services online during every push.',
    category: 'Engineering',
    dateLabel: 'Jan 15, 2026',
    publishedAt: '2026-01-15T00:00:00.000Z',
    readTime: '10 min read',
  },
  {
    slug: 'resource-pooling-bin-packing-containers-like-tetris',
    title: 'Resource Pooling: Bin-Packing Containers Like Tetris',
    excerpt: 'Our placement scheduler fills servers efficiently. Learn how we reduced idle capacity by 38%.',
    category: 'Engineering',
    dateLabel: 'Jan 8, 2026',
    publishedAt: '2026-01-08T00:00:00.000Z',
    readTime: '7 min read',
  },
  {
    slug: 'securing-secrets-aes-256-gcm-at-rest-zero-knowledge-in-transit',
    title: 'Securing Secrets: AES-256-GCM at Rest, Zero-Knowledge in Transit',
    excerpt: 'How Apployd encrypts every environment variable and injects secrets only at container start.',
    category: 'Security',
    dateLabel: 'Dec 30, 2025',
    publishedAt: '2025-12-30T00:00:00.000Z',
    readTime: '5 min read',
  },
  {
    slug: 'read-only-containers-and-why-they-matter',
    title: 'Read-Only Containers and Why They Matter',
    excerpt: "Immutable filesystems block an entire class of runtime attacks. Here's how we enforce them by default.",
    category: 'Security',
    dateLabel: 'Dec 22, 2025',
    publishedAt: '2025-12-22T00:00:00.000Z',
    readTime: '4 min read',
  },
];
