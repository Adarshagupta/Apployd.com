export interface DocSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  callout?: string;
}

export interface ResponsibilityRow {
  area: string;
  platform: string;
  customer: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface DocPage {
  slug: string;
  label: string;
  title: string;
  summary: string;
  updated: string;
  sections: DocSection[];
  responsibilityMatrix?: ResponsibilityRow[];
  faq?: FaqItem[];
}

export interface DocNavLink {
  href: string;
  label: string;
}

export interface DocNavGroup {
  heading: string;
  links: DocNavLink[];
}

export const docPages: DocPage[] = [
  {
    slug: 'getting-started',
    label: 'Quick Start',
    title: 'Getting Started with Apployd',
    summary:
      'Use this guide to move from a new workspace to your first reliable production deployment using Apployd workflows.',
    updated: 'March 8, 2026',
    sections: [
      {
        heading: 'What Apployd is designed for',
        paragraphs: [
          'Apployd is a deployment and operations platform for SaaS teams that need predictable releases, secure configuration handling, and clear runtime visibility.',
          'The goal is not only to deploy quickly, but to keep release quality, reliability, and operational ownership consistent as your product grows.',
        ],
      },
      {
        heading: 'Initial setup flow',
        paragraphs: [
          'Create a workspace, connect your repository, and define runtime settings such as build command, start command, and target port.',
          'Add environment secrets before first launch so the application can boot correctly in production-like conditions.',
        ],
        bullets: [
          'Create workspace and select organization context.',
          'Connect source repository and branch.',
          'Configure runtime commands and service settings.',
          'Add required environment secrets.',
          'Run first deployment and verify health.',
        ],
      },
      {
        heading: 'Choose the correct project type before first deploy',
        paragraphs: [
          'Apployd supports three main deployment modes. Choose the one that matches how your application runs in production, then fill the runtime fields for that mode instead of leaving them generic.',
          'Set Root directory for monorepos, confirm the app binds to 0.0.0.0:$PORT, and add required environment variables before the first production deployment.',
        ],
        bullets: [
          'Web Service: use for Node.js APIs, SSR apps, and full-stack services. Typical values are root apps/api, build npm run build, start npm run start:prod, port 3000.',
          'Python: use for Django, Flask, and FastAPI. Typical values are root backend, optional build python manage.py collectstatic --noinput, start uvicorn main:app --host 0.0.0.0 --port $PORT, port 3000.',
          'Static Site: use for React, Vue, Vite, Astro, and exported Next.js apps. Typical values are root apps/web, build npm run build, output directory dist, and no start command.',
        ],
        callout:
          'Use Static Site only when the project builds to files. If the app needs SSR, API routes, or a persistent Node server, choose Web Service instead.',
      },
      {
        heading: 'How to start safely',
        paragraphs: [
          'Begin with one critical service, validate your deployment process and rollback path, then roll the pattern out across additional services.',
        ],
        callout:
          'Recommended: document your release checklist internally before scaling to multiple production services.',
      },
    ],
  },
  {
    slug: 'deployments',
    label: 'Deployment Workflow',
    title: 'Deployment Workflow',
    summary:
      'Understand how releases move from source to runtime, and how Apployd keeps deployments traceable, controllable, and recoverable.',
    updated: 'March 8, 2026',
    sections: [
      {
        heading: 'Source intake and build execution',
        paragraphs: [
          'Every deployment starts from a selected repository state. This creates a direct link between application behavior and source changes.',
          'Build steps run from the commands you configure. Failures are surfaced early and prevent unstable releases from progressing.',
        ],
      },
      {
        heading: 'Runtime-specific project configuration',
        paragraphs: [
          'Deployment behavior depends on the selected service type. Teams should configure commands and publish settings explicitly instead of treating every repository like the same runtime.',
          'Apployd can auto-detect several production defaults, but the most reliable workflow is to declare the correct project type, root directory, and runtime-specific fields up front.',
        ],
        bullets: [
          'Node Web Service: start command detection prefers start:prod, start, serve, package.json main, then compiled entries such as dist/server.js. Dev commands are not valid production startup commands.',
          'Python: dependency install supports requirements.txt, Pipfile, pyproject.toml, and setup.py. Entrypoint detection covers Django, Flask, FastAPI, wsgi.py, asgi.py, then main.py or app.py.',
          'Static Site: Apployd builds the frontend output and serves the configured publish directory with nginx and SPA fallback to index.html.',
        ],
      },
      {
        heading: 'Release status lifecycle',
        paragraphs: [
          'Operators can monitor deployment progress through clear status stages such as queued, building, deploying, ready, failed, or canceled.',
          'This gives teams a shared operational language during releases and incident response.',
        ],
      },
      {
        heading: 'Rollback and cancellation controls',
        paragraphs: [
          'When a release is risky or degraded, teams can cancel in-progress deploys or roll back to the previous healthy state to reduce impact.',
        ],
      },
    ],
  },
  {
    slug: 'canary-releases',
    label: 'Canary Releases',
    title: 'Canary Releases and Traffic Control',
    summary:
      'Use canary deployments to shift 1 to 99 percent of production traffic, validate live behavior, and either promote or abort safely.',
    updated: 'March 6, 2026',
    sections: [
      {
        heading: 'Where canary controls appear',
        paragraphs: [
          'Canary release controls live on deployment detail pages rather than in a separate global settings area.',
          'The dashboard labels this area as Canary Release. On a stable deployment you will see gradual release controls, and on the live canary you will see traffic management controls.',
        ],
        bullets: [
          'Use the Canary button from the active ready production deployment in the project deployment list.',
          'Use Manage canary on a ready live canary deployment to update traffic, promote, or abort.',
          'If another canary is already active for the project, the dashboard links you to that canary instead of allowing a second one to start.',
        ],
      },
      {
        heading: 'Starting a canary',
        paragraphs: [
          'Canary releases are only supported for production deployments. The stable baseline must be the currently active production deployment, and it must already be ready and running.',
          'When you start a canary, Apployd schedules the new deployment alongside the stable deployment on the same server so weighted routing can split traffic between both containers.',
        ],
        bullets: [
          'Choose a traffic percentage between 1 and 99.',
          'Select one canary source: the latest branch head, a ready preview deployment, an existing reusable deployment, or an explicit branch, commit SHA, or image tag.',
          'Only one active canary is allowed per project at a time.',
        ],
        callout:
          'If the active server does not have enough spare capacity to run the stable and canary containers together, the canary request is rejected until capacity is available.',
      },
      {
        heading: 'Managing live traffic',
        paragraphs: [
          'Once the canary deployment is ready, you can adjust the traffic percentage, promote it to 100 percent, or abort it and route traffic fully back to the stable deployment.',
          'Traffic changes are queued operational actions, so the dashboard can briefly show the previous percentage until the routing update is applied.',
        ],
        bullets: [
          'Update traffic keeps the canary between 1 and 99 percent.',
          'Promote requires the canary deployment to be ready before it can fully replace the stable deployment.',
          'Abort removes the canary from live routing and restores the stable deployment as the only production target.',
        ],
      },
      {
        heading: 'Operational expectations',
        paragraphs: [
          'Canary releases are meant for controlled production validation, not for keeping two long-lived production versions active indefinitely.',
          'Watch error rate, latency, and resource behavior before increasing traffic. Promote only after the canary looks operationally normal under real requests.',
        ],
        bullets: [
          'Use preview deployments first for broader QA, then use canary traffic for real production sampling.',
          'Increase traffic in deliberate steps instead of jumping immediately to a large percentage.',
          'Abort quickly if the canary shows regressions, unstable runtime behavior, or unexpected cost pressure.',
        ],
      },
    ],
  },
  {
    slug: 'security',
    label: 'Security and Abuse Protection',
    title: 'Security and Abuse Protection',
    summary:
      'Apployd uses layered operational controls to protect workloads from misuse, suspicious behavior, and avoidable release risk.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Layered security model',
        paragraphs: [
          'Apployd applies multiple control layers so issues are less likely to spread across unrelated services.',
          'Security is handled continuously through monitoring, policy, and operational review rather than one-time setup tasks.',
        ],
      },
      {
        heading: 'Abuse detection and response',
        paragraphs: [
          'Runtime and deployment behavior are monitored for abuse indicators. Risky patterns can trigger protective actions and visibility signals for operators.',
        ],
        bullets: [
          'Suspicious behavior detection.',
          'Operational alerts and incident visibility.',
          'Support for containment and follow-up response workflows.',
        ],
      },
      {
        heading: 'Operational auditability',
        paragraphs: [
          'Teams can track critical actions with event history so incidents are easier to reconstruct and review.',
        ],
      },
    ],
  },
  {
    slug: 'credentials',
    label: 'Credentials and Secrets',
    title: 'Credentials and Secrets',
    summary:
      'Protecting credentials is a core part of platform safety. Apployd supports secure secret usage patterns for production teams.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Secret-first configuration',
        paragraphs: [
          'Use platform-managed environment secrets instead of storing sensitive values in repository files.',
          'Secrets should be scoped to the right workspace context and controlled through explicit access rules.',
        ],
      },
      {
        heading: 'Credential lifecycle discipline',
        paragraphs: [
          'Strong secret handling requires process discipline. Rotation and revocation should be planned, routine, and incident-driven when needed.',
        ],
        bullets: [
          'Rotate values on policy schedule and after incidents.',
          'Avoid shared human credentials for service access.',
          'Revoke compromised values immediately.',
          'Apply least-privilege access for team members.',
        ],
      },
    ],
  },
  {
    slug: 'databases',
    label: 'Apployd PostgreSQL DB',
    title: 'Apployd PostgreSQL DB',
    summary:
      'Provision and manage PostgreSQL database resources directly from Apployd dashboard workflows.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Standalone database provisioning',
        paragraphs: [
          'Apployd PostgreSQL DB can be created as standalone workspace resources rather than forcing project binding.',
          'This gives teams cleaner control over data lifecycle and service lifecycle.',
        ],
      },
      {
        heading: 'Connection and secret flow',
        paragraphs: [
          'After provisioning, connection strings should be written into protected environment secrets for application usage.',
        ],
        bullets: [
          'Provision database from dashboard.',
          'Capture generated PostgreSQL connection string.',
          'Store it as a managed secret.',
          'Attach to application runtime settings.',
        ],
      },
    ],
  },
  {
    slug: 'analytics',
    label: 'Analytics and Observability',
    title: 'Analytics and Observability',
    summary:
      'Use Apployd analytics to understand resource usage, runtime behavior, and release impact in production.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Operational visibility',
        paragraphs: [
          'Analytics in Apployd are designed for decisions, not vanity charts. Teams can monitor compute usage and deployment outcomes in one place.',
        ],
      },
      {
        heading: 'Usage and capacity signals',
        paragraphs: [
          'Track CPU, memory, bandwidth, and request patterns to forecast scaling needs before reliability degrades.',
        ],
      },
      {
        heading: 'Release impact analysis',
        paragraphs: [
          'Compare deployment history with runtime telemetry to identify which release introduced regressions or increased cost pressure.',
        ],
      },
    ],
  },
  {
    slug: 'teams',
    label: 'Teams and Governance',
    title: 'Teams and Governance',
    summary:
      'Define clear ownership, role boundaries, and operating discipline for multi-user production environments.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Role-based collaboration',
        paragraphs: [
          'Invite team members by workspace and apply role-based permissions for controlled operational access.',
          'Use explicit ownership so high-impact actions are attributable and reviewable.',
        ],
      },
      {
        heading: 'Shared responsibility model',
        paragraphs: [
          'Platform reliability comes from both product controls and team execution quality. Use the matrix below to align responsibilities.',
        ],
      },
    ],
    responsibilityMatrix: [
      {
        area: 'Deployments',
        platform:
          'Pipeline orchestration, release status lifecycle, rollback and cancellation mechanics.',
        customer: 'Code quality, release approvals, and service-level validation strategy.',
      },
      {
        area: 'Security',
        platform: 'Operational controls, abuse visibility, and platform-side risk signaling.',
        customer: 'Access policy, secure coding standards, and incident ownership.',
      },
      {
        area: 'Credentials',
        platform: 'Secret handling workflow and controlled runtime secret usage patterns.',
        customer: 'Secret values, rotation cadence, and least-privilege governance.',
      },
      {
        area: 'Databases',
        platform:
          'Apployd PostgreSQL DB provisioning flow and secure connectivity lifecycle support.',
        customer: 'Schema design, migration quality, and data recovery policy.',
      },
      {
        area: 'Analytics',
        platform: 'Usage and deployment telemetry surfaces for operational visibility.',
        customer: 'Capacity planning, optimization priorities, and budget decisions.',
      },
    ],
  },
  {
    slug: 'billing',
    label: 'Billing and Limits',
    title: 'Billing and Limits',
    summary:
      'Understand plan-based entitlements, resource pools, and how to align spend with growth and reliability requirements.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Plan entitlements',
        paragraphs: [
          'Each plan defines available features and operational limits. Teams should review entitlements before rollout decisions.',
        ],
      },
      {
        heading: 'Resource pools and scaling',
        paragraphs: [
          'CPU, memory, and bandwidth pools should be reviewed against expected traffic to avoid sudden saturation.',
        ],
      },
      {
        heading: 'Cost-aware operations',
        paragraphs: [
          'Combine usage analytics with release planning so capacity increases are intentional rather than reactive.',
        ],
      },
    ],
  },
  {
    slug: 'incidents',
    label: 'Incident and Support Flow',
    title: 'Incident and Support Flow',
    summary:
      'Use structured incident handling to reduce customer impact and improve recovery quality when production issues occur.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Immediate response priorities',
        paragraphs: [
          'When incidents happen, prioritize customer impact reduction first, then evidence preservation, then detailed root-cause analysis.',
        ],
        bullets: [
          'Stabilize service and contain impact.',
          'Use rollback or cancellation where appropriate.',
          'Capture logs and timeline details before state is lost.',
          'Rotate affected credentials if risk exists.',
        ],
      },
      {
        heading: 'After-action discipline',
        paragraphs: [
          'Publish internal follow-up actions with owners and deadlines so the same failure pattern is less likely to recur.',
        ],
        callout: 'Use incident reviews to improve systems, not to assign blame.',
      },
    ],
  },
  {
    slug: 'faq',
    label: 'FAQ',
    title: 'Frequently Asked Questions',
    summary: 'Common product and operations questions for teams running workloads on Apployd.',
    updated: 'February 27, 2026',
    sections: [
      {
        heading: 'Overview',
        paragraphs: [
          'These answers focus on practical operations and product behavior rather than implementation internals.',
        ],
      },
    ],
    faq: [
      {
        question: 'Do I need deep DevOps expertise to run on Apployd?',
        answer:
          'No. Apployd is designed to simplify release operations with guided workflows, visibility, and recovery controls.',
      },
      {
        question: 'Can I deploy continuously while keeping control?',
        answer:
          'Yes. Teams can use auto deploy with branch discipline while preserving cancellation and rollback options.',
      },
      {
        question: 'How are credentials protected in practice?',
        answer:
          'Use managed secrets in environment configuration, restrict editor access, and rotate values after incidents or policy windows.',
      },
      {
        question: 'Can databases be created without creating a project first?',
        answer:
          'Yes. Apployd PostgreSQL DB supports standalone provisioning from the Databases area.',
      },
      {
        question: 'What are the most important production signals to monitor?',
        answer:
          'Track deployment outcomes, runtime health, and resource usage together. That combination catches most issues early.',
      },
    ],
  },
];

export const defaultDocSlug = 'getting-started';

export const docPageMap: Record<string, DocPage> = Object.fromEntries(
  docPages.map((page) => [page.slug, page]),
);

export const docsNavGroups: DocNavGroup[] = [
  {
    heading: 'Getting Started',
    links: [
      { href: '/docs/getting-started', label: 'Quick Start' },
      { href: '/docs/deployments', label: 'Deployment Workflow' },
      { href: '/docs/canary-releases', label: 'Canary Releases' },
    ],
  },
  {
    heading: 'Security and Data',
    links: [
      { href: '/docs/security', label: 'Security and Abuse Protection' },
      { href: '/docs/credentials', label: 'Credentials and Secrets' },
      { href: '/docs/databases', label: 'Apployd PostgreSQL DB' },
    ],
  },
  {
    heading: 'Operations',
    links: [
      { href: '/docs/analytics', label: 'Analytics and Observability' },
      { href: '/docs/teams', label: 'Teams and Governance' },
      { href: '/docs/billing', label: 'Billing and Limits' },
      { href: '/docs/incidents', label: 'Incident and Support Flow' },
      { href: '/docs/faq', label: 'FAQ' },
    ],
  },
];

export const docsAllLinks: DocNavLink[] = docsNavGroups.flatMap((group) => group.links);
