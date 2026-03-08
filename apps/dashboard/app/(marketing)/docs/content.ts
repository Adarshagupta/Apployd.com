export interface DocSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  codeBlocks?: DocCodeBlock[];
  callout?: string;
}

export interface DocCodeBlock {
  language: 'bash' | 'json' | 'text';
  code: string;
  caption?: string;
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
    slug: 'vscode-extension',
    label: 'VS Code Extension',
    title: 'Use Apployd from the VS Code Extension',
    summary:
      'Connect VS Code to Apployd so you can review organizations, projects, deployments, and logs without leaving the editor.',
    updated: 'March 8, 2026',
    sections: [
      {
        heading: 'What the extension is for',
        paragraphs: [
          'The Apployd VS Code extension gives operators a native sidebar for account context, project visibility, deployment actions, and log access from inside the editor.',
          'It is designed for day-to-day operational work such as checking deployment status, starting a new release, canceling a risky rollout, or opening the dashboard for deeper inspection.',
        ],
        bullets: [
          'Overview view for account and organization context.',
          'Projects view for project details and inline actions.',
          'Deployments view for recent releases and status inspection.',
          'Command Palette actions for sign in, refresh, deploy, cancel, logs, and dashboard links.',
        ],
      },
      {
        heading: 'Initial setup',
        paragraphs: [
          'After installing the extension in VS Code, open the Apployd activity bar entry to load the Overview, Projects, and Deployments views.',
          'The default configuration targets the hosted Apployd control plane, but teams running a local or self-hosted environment should override the API and dashboard base URLs in VS Code settings.',
        ],
        bullets: [
          'apployd.apiBaseUrl defaults to https://apployd.com/api/v1.',
          'apployd.dashboardBaseUrl defaults to https://apployd.com.',
          'For local development use http://localhost:4000/api/v1 and http://localhost:3000.',
        ],
      },
      {
        heading: 'Sign in and organization selection',
        paragraphs: [
          'Use Apployd: Sign In from the sidebar or Command Palette, enter your email and password, and complete email verification if the login flow requires a one-time code.',
          'Once authenticated, select the working organization so project and deployment views load the correct workspace context.',
        ],
        bullets: [
          'Authentication tokens are stored in VS Code SecretStorage rather than plain settings.',
          'Use Apployd: Select Organization whenever you need to switch workspace context.',
          'Use Apployd: Sign Out to clear the stored session from the extension.',
        ],
      },
      {
        heading: 'Daily workflow inside VS Code',
        paragraphs: [
          'The Overview view gives a quick operational snapshot, including the signed-in account, selected organization, project count, and recent deployment count.',
          'The Projects and Deployments views provide the primary release workflow: choose a project, deploy to production or preview, inspect recent history, copy deployment identifiers, cancel in-progress deployments, and fetch project logs into the output panel.',
        ],
        bullets: [
          'Use Projects to inspect branch, runtime, and target port for each project.',
          'Use Deploy Now to queue a production or preview deployment with optional branch and commit overrides.',
          'Use Show Logs to open the latest project logs in the Apployd output channel.',
          'Use Deployments to review recent release status and cancel in-progress runs when necessary.',
          'Use Open Project Dashboard or Open Dashboard when you need the full web interface.',
        ],
      },
      {
        heading: 'Current scope',
        paragraphs: [
          'The extension currently focuses on operational visibility and common deployment actions rather than full project administration.',
          'Teams should still use the dashboard for broader setup flows such as project creation, secret management, and other advanced platform features not yet exposed in the extension.',
        ],
        callout:
          'This extension is currently an MVP. Treat it as an operator workflow surface, not a complete replacement for the dashboard.',
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
    slug: 'mcp',
    label: 'MCP Server',
    title: 'Use Apployd with MCP Clients',
    summary:
      'Connect Apployd to MCP-compatible clients so users can list projects, inspect deployments, and trigger releases from agent workflows.',
    updated: 'March 7, 2026',
    sections: [
      {
        heading: 'What the MCP package does',
        paragraphs: [
          'The Apployd MCP package exposes deployment operations as MCP tools over stdio. An MCP client starts the package locally, then calls Apployd APIs through the authenticated session on behalf of the user.',
          'This makes it possible to list projects, create deployments, inspect recent releases, and cancel active deployments without building a separate integration for each client.',
        ],
        bullets: [
          'Package name: @apployd/mcp-server',
          'Launch mode: stdio MCP server started by the MCP client',
          'Auth flow: browser login similar to npm login or gh auth login',
          'Core tools: get_current_user, list_projects, list_recent_deployments, list_project_deployments, get_deployment, create_deployment, cancel_deployment',
        ],
      },
      {
        heading: 'Install and sign in',
        paragraphs: [
          'Users do not need to clone the Apployd repo. The recommended path is to run the published npm package directly with npx, then complete the browser login flow once on that machine.',
          'After login, the package caches credentials locally and most MCP clients can start the server without passing APPLOYD_API_TOKEN explicitly.',
        ],
        codeBlocks: [
          {
            language: 'bash',
            caption: 'Run the login flow and verify the cached session',
            code: `npx -y @apployd/mcp-server login
npx -y @apployd/mcp-server whoami`,
          },
          {
            language: 'bash',
            caption: 'Remove the cached session',
            code: 'npx -y @apployd/mcp-server logout',
          },
        ],
        callout:
          'If a user prefers not to store cached credentials locally, they can still provide APPLOYD_API_TOKEN directly in the MCP client environment.',
      },
      {
        heading: 'Add it to an MCP client',
        paragraphs: [
          'Most MCP clients can start the package with npx. In the simplest setup, only the Apployd API base URL is required because the cached login session supplies the token automatically.',
          'Set APPLOYD_DEFAULT_ORGANIZATION_ID when the authenticated user belongs to more than one organization and the client should not prompt the agent to disambiguate.',
        ],
        codeBlocks: [
          {
            language: 'json',
            caption: 'Example MCP client configuration',
            code: `{
  "mcpServers": {
    "apployd": {
      "command": "npx",
      "args": ["-y", "@apployd/mcp-server"],
      "env": {
        "APPLOYD_API_BASE_URL": "https://apployd.com/api/v1",
        "APPLOYD_DEFAULT_ORGANIZATION_ID": "optional organization cuid"
      }
    }
  }
}`,
          },
        ],
      },
      {
        heading: 'Common usage patterns',
        paragraphs: [
          'Once the MCP client is configured, the user can ask the client to operate on Apployd resources in natural language. The MCP package translates those requests into the underlying API calls.',
          'Good prompts are explicit about the project, environment, and source reference so the resulting deployment matches the intended release.',
        ],
        bullets: [
          'List my Apployd projects.',
          'Show the latest deployments for my organization.',
          'Deploy project abc123 to production from branch main.',
          'Cancel deployment dep_123 if it is still in progress.',
        ],
      },
      {
        heading: 'Direct environment-variable auth',
        paragraphs: [
          'For controlled environments such as CI, shared workstations, or clients that should not rely on local cached credentials, set the token explicitly in the MCP client configuration.',
        ],
        codeBlocks: [
          {
            language: 'json',
            caption: 'Explicit token-based configuration',
            code: `{
  "mcpServers": {
    "apployd": {
      "command": "npx",
      "args": ["-y", "@apployd/mcp-server"],
      "env": {
        "APPLOYD_API_TOKEN": "your apployd token",
        "APPLOYD_API_BASE_URL": "https://apployd.com/api/v1",
        "APPLOYD_DEFAULT_ORGANIZATION_ID": "optional organization cuid"
      }
    }
  }
}`,
          },
        ],
      },
    ],
    faq: [
      {
        question: 'Does the MCP package deploy code by itself?',
        answer:
          'No. It is a local MCP wrapper around Apployd APIs. Deployments still run through the normal Apployd control plane and permission checks.',
      },
      {
        question: 'Do users need a long-lived token to get started?',
        answer:
          'No. The recommended flow is browser login with npx, which caches the authenticated session locally for later MCP use.',
      },
      {
        question: 'What should users do if they belong to more than one organization?',
        answer:
          'Set APPLOYD_DEFAULT_ORGANIZATION_ID in the MCP client configuration so deployment and listing requests resolve against the intended organization consistently.',
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
      { href: '/docs/vscode-extension', label: 'VS Code Extension' },
      { href: '/docs/deployments', label: 'Deployment Workflow' },
      { href: '/docs/canary-releases', label: 'Canary Releases' },
      { href: '/docs/mcp', label: 'MCP Server' },
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
