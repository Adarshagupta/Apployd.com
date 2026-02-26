BEGIN;

INSERT INTO "users" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt")
SELECT
  'seed-editor-apployd',
  'editor@apployd.com',
  'seed:editor',
  'Apployd Editorial',
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM "users"
  WHERE LOWER("email") = 'editor@apployd.com'
);

WITH author_row AS (
  SELECT "id"
  FROM "users"
  WHERE LOWER("email") LIKE '%@apployd.com'
  ORDER BY "createdAt" ASC
  LIMIT 1
), seed_posts AS (
  SELECT *
  FROM (
    VALUES
      (
        'seed-post-20260225-01',
        'tech-roundup-feb-2026-cloud-ai-platform-engineering',
        'Tech Roundup: February 2026 in Cloud, AI, and Platform Engineering',
        'A February 2026 roundup of the platform and infrastructure shifts engineering teams are watching most closely.',
        $$February 2026 has been a strong signal month for platform teams. The biggest movement is not a single launch, but the continued convergence of AI workloads, cost governance, and security automation into one operating model.

Teams are reducing deployment friction by standardizing reusable pipelines, policy checks, and environment templates. This shift cuts release lead time while keeping auditability high.

Another clear trend is runtime visibility becoming default. More organizations now treat deployment events, health checks, and usage telemetry as first-class release signals instead of optional dashboards.

For Apployd users, this maps directly to practical outcomes: safer auto deploys, faster rollback decisions, and clearer production accountability across teams.$$,
        'news',
        'published',
        '2026-02-24 10:00:00'
      ),
      (
        'seed-post-20260225-02',
        'feb-2026-app-security-runtime-hardening-update',
        'February 2026 App Security Update: Runtime Hardening Becomes Standard',
        'Security posture is shifting left and right at the same time, with stronger CI checks and stronger runtime enforcement.',
        $$Security programs in February 2026 are increasingly dual-layered: strict software supply chain controls during build, plus runtime behavior enforcement in production.

Teams are prioritizing alert quality over alert volume, using focused rules for suspicious egress, privilege escalation attempts, and unusual process trees.

Operationally, the strongest pattern is integrated response. Detection, user notification, and appeal workflows are being connected so incidents are traceable from trigger to resolution.

In Apployd, this security model aligns with incident status tracking, automated blocking, and controlled unblock actions from a central dashboard.$$,
        'news',
        'published',
        '2026-02-22 14:10:00'
      ),
      (
        'seed-post-20260225-03',
        'feb-2026-gitops-and-auto-deploy-adoption-trends',
        'GitOps and Auto Deploy Trends in February 2026',
        'Git push to production is maturing from convenience feature to controlled engineering workflow.',
        $$Auto deployment adoption accelerated in February 2026, especially among teams that pair it with branch protection, scoped approvals, and strong rollback mechanics.

The key pattern is confidence through policy. When auto deploy is gated by predictable checks and explicit ownership, release speed improves without sacrificing reliability.

Teams are also investing in event-level traceability: who triggered, what changed, where it ran, and how it behaved. This context shortens incident response time significantly.

For growing SaaS teams, the combination of Git integration plus controlled automation is becoming the default deployment posture.$$,
        'news',
        'published',
        '2026-02-20 08:20:00'
      ),
      (
        'seed-post-20260225-04',
        'feb-2026-finops-focus-in-platform-operations',
        'Platform FinOps Focus: What Changed in February 2026',
        'Infrastructure cost discipline is now tightly coupled with deployment architecture and environment policies.',
        $$FinOps in February 2026 is less about monthly reports and more about real-time control during delivery workflows.

Engineering teams are using allocation limits, usage thresholds, and environment defaults to prevent cost spikes before they happen. This proactive model is replacing late-cycle cost cleanup.

A second trend is cost-aware architecture decisions. Teams now compare deployment frequency, compute footprint, and traffic shape as one optimization problem.

Apployd supports this direction with pooled resource visibility, usage tracking, and subscription-linked controls across organizations and projects.$$,
        'news',
        'published',
        '2026-02-18 12:35:00'
      ),
      (
        'seed-post-20260225-05',
        'feb-2026-ops-observability-release-quality',
        'Release Quality in February 2026: Observability Is Part of Delivery',
        'Teams are treating logs, deployment events, and health telemetry as mandatory release controls.',
        $$A notable February 2026 operations trend is observability integrated into release decisions. Deployments are no longer considered complete when a container starts; they are complete when runtime signals confirm health.

This changes rollback behavior. Instead of waiting for customer impact, teams can react on anomaly signals from deployment and service telemetry quickly.

Cross-team clarity also improves when logs, status transitions, and ownership context live in one surface.

Modern deployment platforms are expected to provide this by default, not as an afterthought.$$,
        'news',
        'published',
        '2026-02-16 09:00:00'
      ),
      (
        'seed-post-20260225-06',
        'how-to-deploy-on-apployd-from-github',
        'How to Deploy on Apployd from GitHub in Minutes',
        'A practical guide to connect GitHub, configure build settings, and launch your first production-ready deployment.',
        $$Deploying on Apployd starts with three steps: connect GitHub, create a project, and configure your runtime commands.

After GitHub is connected, pick the repository and branch. Apployd can trigger deployment automatically on new commits, so your delivery pipeline stays consistent.

Next, define install, build, and start commands. Keep these commands deterministic and environment-safe to avoid release drift.

Before production rollout, add required secrets and verify health checks. If a release fails, use rollback controls and deployment logs to recover quickly.

This workflow gives teams both speed and operational confidence from the first deploy.$$,
        'blog',
        'published',
        '2026-02-25 08:30:00'
      ),
      (
        'seed-post-20260225-07',
        'about-apployd-why-we-built-it',
        'About Apployd: Why We Built This Deployment Platform',
        'Apployd was built to simplify reliable software delivery for teams running real production workloads.',
        $$Apployd was created to solve a common gap: teams outgrow simple deploy tools, but enterprise platforms often add too much complexity too soon.

Our goal is straightforward: provide a controlled deployment system with practical defaults for security, observability, and team collaboration.

We focus on what engineering teams need daily: predictable releases, Git-based workflows, role-aware access, clear usage visibility, and fast incident response.

Apployd is not just about shipping code faster. It is about shipping safely, repeatedly, and transparently as your product and team scale.$$,
        'blog',
        'published',
        '2026-02-14 11:00:00'
      ),
      (
        'seed-post-20260225-08',
        'apployd-best-practices-for-production-deployments',
        'Apployd Best Practices for Production Deployments',
        'Use these deployment patterns to reduce failed releases and improve recovery speed in production.',
        $$Start with clean branch strategy and explicit review ownership. Auto deploy is most effective when code flow is disciplined.

Use environment-specific secrets and avoid embedding sensitive values into build artifacts. Rotate critical credentials regularly.

Define health checks and monitor initial post-deploy windows closely. A release is only successful when runtime behavior is stable.

Keep rollback readiness high. Store enough deployment metadata to identify safe recovery points immediately.

Finally, track usage and capacity to avoid silent scaling bottlenecks that impact availability under real traffic.$$,
        'blog',
        'published',
        '2026-02-12 15:15:00'
      ),
      (
        'seed-post-20260225-09',
        'apployd-onboarding-checklist-for-new-teams',
        'Apployd Onboarding Checklist for New Teams',
        'A complete onboarding checklist for teams adopting Apployd for application delivery and operations.',
        $$A successful onboarding starts with clear ownership. Assign who manages Git integration, billing, and deployment policy.

Connect GitHub first, then invite team members with role-based access. Keep permissions minimal and expand only when needed.

Set plan and resource allocations before scaling projects. This prevents cost surprises and improves workload planning.

Create your first project with explicit runtime commands and environment variables. Verify deployment logs and status transitions.

Complete onboarding by defining security response flow so incidents and unblock actions are handled consistently.$$,
        'blog',
        'published',
        '2026-02-10 13:45:00'
      ),
      (
        'seed-post-20260225-10',
        'apployd-security-and-trust-model-explained',
        'Apployd Security and Trust Model Explained',
        'How Apployd approaches runtime safety, incident handling, and operational trust in production.',
        $$Apployd security is built on layered controls: secure defaults at deploy time, runtime detection for abnormal behavior, and operator actions for controlled recovery.

When suspicious activity is detected, incidents are recorded with evidence and status transitions. This supports both fast response and audit clarity.

User communication matters during security events. Notifications, reason visibility, and structured appeals reduce confusion and improve trust.

Administrative unblock controls are intentionally explicit, with role checks and traceable actions.

This model helps teams balance protection and operational continuity without sacrificing accountability.$$,
        'blog',
        'published',
        '2026-02-08 16:40:00'
      )
  ) AS t(
    id,
    slug,
    title,
    excerpt,
    content,
    kind,
    status,
    publishedAt
  )
)
INSERT INTO "content_posts" (
  "id",
  "slug",
  "title",
  "excerpt",
  "content",
  "kind",
  "status",
  "publishedAt",
  "authorId",
  "createdAt",
  "updatedAt"
)
SELECT
  sp.id,
  sp.slug,
  sp.title,
  sp.excerpt,
  sp.content,
  sp.kind::"ContentPostKind",
  sp.status::"ContentPostStatus",
  sp.publishedAt::timestamp,
  a."id",
  NOW(),
  NOW()
FROM seed_posts sp
CROSS JOIN author_row a
ON CONFLICT ("slug") DO UPDATE
SET
  "title" = EXCLUDED."title",
  "excerpt" = EXCLUDED."excerpt",
  "content" = EXCLUDED."content",
  "kind" = EXCLUDED."kind",
  "status" = EXCLUDED."status",
  "publishedAt" = EXCLUDED."publishedAt",
  "authorId" = EXCLUDED."authorId",
  "updatedAt" = NOW();

COMMIT;
