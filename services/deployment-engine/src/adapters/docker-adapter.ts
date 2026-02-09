import { randomInt } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import net from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

import { runCommand, runCommandStreaming, type LogCallback } from '../core/run-command.js';

const shellEscape = (value: string) =>
  process.platform === 'win32' ? `"${value.replace(/"/g, '\\"')}"` : `'${value.replace(/'/g, `'\"'\"'`)}'`;

/**
 * Sanitize sensitive data from logs and errors (Vercel/Render grade security)
 * Prevents credential leaks in build logs, error messages, and monitoring
 */
const SENSITIVE_PATTERNS = [
  /(?:password|passwd|pwd|secret|token|key|auth|api[-_]?key)[:=]\s*['"]?([^\s'"]+)/gi,
  /(?:postgres|mysql|mongodb):\/\/[^:]+:([^@]+)@/gi,
  /Bearer\s+([A-Za-z0-9\-._~+/]+=*)/gi,
  /(?:^|&)(?:password|token|secret|key)=([^&\s]+)/gi,
];

function sanitizeLog(message: string): string {
  let sanitized = message;
  SENSITIVE_PATTERNS.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, (match) => {
      return match.replace(/(?<=[:=])\s*['"]?[^\s'"]+/, ' [REDACTED]');
    });
  });
  return sanitized;
}

/**
 * Sanitize environment variable names for logging
 * Only show names, never values
 */
function sanitizeEnvForLog(env: Record<string, string>): string {
  const keys = Object.keys(env).sort();
  return keys.length > 0 ? `(${keys.length} vars: ${keys.join(', ')})` : '(no env vars)';
}

/**
 * Universal multi-stage Dockerfile with BuildKit cache mounts.
 *
 * Caching strategy (Vercel/Render grade):
 * ─────────────────────────────────────────
 * 1. Lockfile-first COPY — installs deps in a cacheable layer that only
 *    invalidates when the lockfile changes (not on every code change).
 * 2. BuildKit --mount=type=cache — persists npm/yarn/pnpm caches AND
 *    node_modules between builds. Keyed per-project so different projects
 *    don't pollute each other's caches.
 * 3. Framework build caches — Next.js .next/cache, Vite, Nuxt, etc. are
 *    mounted as persistent caches so incremental builds are instant.
 * 4. Git clone layer stays at the top so it changes on every deploy,
 *    but everything below it benefits from cache mounts.
 *
 * Result: First build is full speed; subsequent builds are 2-10× faster.
 */
function universalDockerfile(serviceType: 'web_service' | 'static_site' = 'web_service', projectId = 'default'): string {
  if (serviceType === 'static_site') {
    return staticSiteDockerfile(projectId);
  }
  return webServiceDockerfile(projectId);
}

/**
 * Dockerfile for backend / web service projects.
 * Uses BuildKit cache mounts for blazing-fast rebuilds.
 */
function webServiceDockerfile(projectId: string): string {
  return [
    '# syntax=docker/dockerfile:1',
    '',
    '# ---- Stage 1: Clone repository ----',
    'FROM alpine/git:latest AS source',
    'ARG GIT_URL',
    'ARG GIT_BRANCH=""',
    'ARG GIT_SHA=""',
    'WORKDIR /repo',
    'RUN if [ -n "${GIT_BRANCH}" ]; then git clone --depth=1 --branch "${GIT_BRANCH}" "${GIT_URL}" .; else git clone --depth=1 "${GIT_URL}" .; fi && \\',
    '    if [ -n "${GIT_SHA}" ]; then git fetch --depth=1 origin "${GIT_SHA}" && git checkout "${GIT_SHA}"; fi',
    '',
    '# ---- Stage 2: Build application ----',
    'FROM node:20-bookworm-slim',
    '# Install comprehensive native dependencies for Node.js and Python',
    'RUN apt-get update && apt-get install -y --no-install-recommends \\',
    '    build-essential autoconf automake libtool pkg-config make cmake \\',
    '    git openssh-client ca-certificates curl \\',
    '    python3 python3-pip python3-venv python3-dev \\',
    '    libvips-dev libcairo2-dev libpango1.0-dev \\',
    '    libpng-dev libjpeg-dev libgif-dev librsvg2-dev \\',
    '    libfreetype6-dev fontconfig libpixman-1-dev \\',
    '    liblcms2-dev libwebp-dev nasm \\',
    '    libpq-dev default-libmysqlclient-dev \\',
    '    libffi-dev libssl-dev \\',
    '    libxml2-dev libxslt-dev \\',
    '    zlib1g-dev \\',
    '    && rm -rf /var/lib/apt/lists/*',
    '',
    'ARG ROOT_DIR=.',
    'WORKDIR /app',
    '',
    '# ── Lockfile-first: copy ONLY lockfiles so deps layer is cached ──',
    'COPY --from=source /repo/${ROOT_DIR}/package.json ./package.json',
    'RUN --mount=type=bind,from=source,source=/repo,target=/src \\',
    '    for f in package-lock.json yarn.lock pnpm-lock.yaml bun.lockb .npmrc .yarnrc.yml; do \\',
    '      [ -f "/src/${ROOT_DIR}/$f" ] && cp "/src/${ROOT_DIR}/$f" ./ ; \\',
    '    done; true',
    '',
    '# ── Install dependencies with persistent caches ──',
    '# --ignore-scripts: Skip preinstall/postinstall (Vercel behavior)',
    `# Cache key: project=${projectId}`,
    'RUN --mount=type=cache,id=npm-' + projectId + ',target=/root/.npm \\',
    '    --mount=type=cache,id=yarn-' + projectId + ',target=/usr/local/share/.cache/yarn \\',
    '    --mount=type=cache,id=pnpm-' + projectId + ',target=/root/.local/share/pnpm/store \\',
    '    --mount=type=cache,id=node_modules-' + projectId + ',target=/app/node_modules \\',
    '    set -ex; \\',
    '    if [ -f package-lock.json ]; then npm ci --ignore-scripts || npm install --ignore-scripts || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); \\',
    '    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile --ignore-scripts || yarn install --ignore-scripts; \\',
    '    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts; \\',
    '    elif [ -f bun.lockb ]; then npx bun install --ignore-scripts; \\',
    '    elif [ -f package.json ]; then npm install --ignore-scripts || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); fi; \\',
    '    if [ -f requirements.txt ]; then pip3 install --no-cache-dir --break-system-packages -r requirements.txt; \\',
    '    elif [ -f Pipfile ]; then pip3 install --break-system-packages pipenv && pipenv install --system --deploy; \\',
    '    elif [ -f pyproject.toml ]; then pip3 install --no-cache-dir --break-system-packages .; fi; \\',
    '    # Snapshot node_modules out of cache mount so they persist in the image',
    '    cp -a /app/node_modules /tmp/_node_modules 2>/dev/null || true',
    '',
    '# ── Copy full source (after deps are cached) ──',
    'COPY --from=source /repo/${ROOT_DIR}/ .',
    '# Restore node_modules from cache snapshot',
    'RUN if [ -d /tmp/_node_modules ]; then rm -rf node_modules && mv /tmp/_node_modules node_modules; fi',
    '',
    '# ── Build with framework cache persistence ──',
    'ENV NODE_OPTIONS="--openssl-legacy-provider"',
    'ARG BUILD_CMD=""',
    'RUN --mount=type=cache,id=nextcache-' + projectId + ',target=/app/.next/cache \\',
    '    --mount=type=cache,id=buildcache-' + projectId + ',target=/app/.cache \\',
    '    set -e; \\',
    '    if [ -n "${BUILD_CMD}" ]; then \\',
    '      echo ">>> Running custom build: ${BUILD_CMD}"; \\',
    '      sh -c "${BUILD_CMD}"; \\',
    '    elif [ -f package.json ]; then \\',
    '      HAS_BUILD=$(node -e "var s=JSON.parse(require(\'fs\').readFileSync(\'package.json\',\'utf8\')).scripts||{}; var cmd=s.build||\'\'; if(!cmd||/\\b(ts-node-dev|tsx watch|nodemon|next dev|nuxt dev|vite dev|remix dev|ng serve)\\b/.test(cmd)){process.exit(1)} process.exit(0)" 2>/dev/null && echo yes || echo no); \\',
    '      if [ "$HAS_BUILD" = "yes" ]; then \\',
    '        echo ">>> Running: npm run build"; \\',
    '        npm run build; \\',
    '      else \\',
    '        echo ">>> No build script found (or it is a dev-only command), skipping build step"; \\',
    '      fi; \\',
    '    elif [ -f Makefile ]; then \\',
    '      echo ">>> Detected Makefile, running: make"; \\',
    '      make; \\',
    '    else \\',
    '      echo ">>> No build system detected, skipping build step"; \\',
    '    fi',
    '',
    '# Clear legacy OpenSSL flag for runtime',
    'ENV NODE_OPTIONS=""',
    '',
    'ARG APP_PORT=3000',
    'ENV PORT=${APP_PORT}',
    'EXPOSE ${APP_PORT}',
    '',
    '# Universal start: explicit > package.json scripts > main field > common entries > Python',
    'ARG START_CMD=""',
    'RUN set -e; \\',
    '    if [ -n "${START_CMD}" ]; then \\',
    '      echo ">>> Using custom start command: ${START_CMD}"; \\',
    '      printf \'#!/bin/sh\\nexec %s\\n\' "${START_CMD}" > /entrypoint.sh; \\',
    '    elif [ -f package.json ]; then \\',
    '      SCRIPTS=$(node -e "var s=JSON.parse(require(\'fs\').readFileSync(\'package.json\',\'utf8\')).scripts||{}; console.log(JSON.stringify(s))" 2>/dev/null || echo "{}"); \\',
    '      MAIN=$(node -e "console.log(JSON.parse(require(\'fs\').readFileSync(\'package.json\',\'utf8\')).main||\'\'" 2>/dev/null || echo ""); \\',
    '      is_dev_cmd() { echo "$1" | grep -qiE "(ts-node-dev|tsx watch|nodemon|next dev|nuxt dev|vite dev|remix dev|ng serve|webpack-dev-server)"; }; \\',
    '      get_script() { echo "$SCRIPTS" | node -e "var s=JSON.parse(require(\'fs\').readFileSync(\'/dev/stdin\',\'utf8\')); console.log(s[\'$1\']||\'\')" 2>/dev/null; }; \\',
    '      START_PROD=$(get_script "start:prod"); \\',
    '      START_SERVE=$(get_script "serve"); \\',
    '      START=$(get_script "start"); \\',
    '      if [ -n "$START_PROD" ] && ! is_dev_cmd "$START_PROD"; then \\',
    '        echo ">>> Using: npm run start:prod"; \\',
    '        printf \'#!/bin/sh\\nexec npm run start:prod\\n\' > /entrypoint.sh; \\',
    '      elif [ -n "$START" ] && ! is_dev_cmd "$START"; then \\',
    '        echo ">>> Using: npm start"; \\',
    '        printf \'#!/bin/sh\\nexec npm start\\n\' > /entrypoint.sh; \\',
    '      elif [ -n "$START_SERVE" ] && ! is_dev_cmd "$START_SERVE"; then \\',
    '        echo ">>> Using: npm run serve"; \\',
    '        printf \'#!/bin/sh\\nexec npm run serve\\n\' > /entrypoint.sh; \\',
    '      elif [ -n "$MAIN" ]; then \\',
    '        echo ">>> Using main field: node $MAIN"; \\',
    '        printf \'#!/bin/sh\\nexec node %s\\n\' "$MAIN" > /entrypoint.sh; \\',
    '      else \\',
    '        ENTRY=""; \\',
    '        for f in dist/main.js dist/index.js dist/server.js build/index.js build/main.js build/server.js server.js index.js app.js main.js src/index.js src/server.js src/main.js; do \\',
    '          if [ -f "$f" ]; then ENTRY="$f"; break; fi; \\',
    '        done; \\',
    '        if [ -n "$ENTRY" ]; then \\',
    '          echo ">>> Auto-detected entry point: node $ENTRY"; \\',
    '          printf \'#!/bin/sh\\nexec node %s\\n\' "$ENTRY" > /entrypoint.sh; \\',
    '        else \\',
    '          echo ">>> No start script or entry point found, defaulting to: node server.js"; \\',
    '          printf \'#!/bin/sh\\nexec node server.js\\n\' > /entrypoint.sh; \\',
    '        fi; \\',
    '      fi; \\',
    '    elif [ -f manage.py ]; then \\',
    '      echo ">>> Detected Django project"; \\',
    '      printf \'#!/bin/sh\\nexec python3 manage.py runserver 0.0.0.0:${PORT:-3000}\\n\' > /entrypoint.sh; \\',
    '    elif [ -f app.py ] || [ -f wsgi.py ]; then \\',
    '      echo ">>> Detected Python web app"; \\',
    '      if python3 -c "import gunicorn" 2>/dev/null; then \\',
    '        printf \'#!/bin/sh\\nexec gunicorn --bind 0.0.0.0:${PORT:-3000} app:app\\n\' > /entrypoint.sh; \\',
    '      else \\',
    '        printf \'#!/bin/sh\\nexec python3 -m flask run --host=0.0.0.0 --port=${PORT:-3000}\\n\' > /entrypoint.sh; \\',
    '      fi; \\',
    '    elif [ -f requirements.txt ] || [ -f Pipfile ] || [ -f pyproject.toml ]; then \\',
    '      echo ">>> Detected Python project, defaulting to Flask"; \\',
    '      printf \'#!/bin/sh\\nexec python3 -m flask run --host=0.0.0.0 --port=${PORT:-3000}\\n\' > /entrypoint.sh; \\',
    '    elif [ -f main.go ]; then \\',
    '      echo ">>> Detected Go project"; \\',
    '      printf \'#!/bin/sh\\nexec ./main\\n\' > /entrypoint.sh; \\',
    '    else \\',
    '      echo ">>> No runtime detected, defaulting to: node server.js"; \\',
    '      printf \'#!/bin/sh\\nexec node server.js\\n\' > /entrypoint.sh; \\',
    '    fi && chmod +x /entrypoint.sh',
    'ENTRYPOINT ["/entrypoint.sh"]',
  ].join('\n');
}

/**
 * Dockerfile for static frontend projects (React, Vue, Next.js static, etc.).
 *
 * Stage 1 — clone repo
 * Stage 2 — install deps & build
 * Stage 3 — nginx serves the build output directory
 */
function staticSiteDockerfile(projectId: string): string {
  return [
    '# syntax=docker/dockerfile:1',
    '',
    '# ---- Stage 1: Clone repository ----',
    'FROM alpine/git:latest AS source',
    'ARG GIT_URL',
    'ARG GIT_BRANCH=""',
    'ARG GIT_SHA=""',
    'WORKDIR /repo',
    'RUN if [ -n "${GIT_BRANCH}" ]; then git clone --depth=1 --branch "${GIT_BRANCH}" "${GIT_URL}" .; else git clone --depth=1 "${GIT_URL}" .; fi && \\',
    '    if [ -n "${GIT_SHA}" ]; then git fetch --depth=1 origin "${GIT_SHA}" && git checkout "${GIT_SHA}"; fi',
    '',
    '# ---- Stage 2: Install & Build ----',
    'FROM node:20-bookworm-slim AS builder',
    'RUN apt-get update && apt-get install -y --no-install-recommends \\',
    '    build-essential autoconf automake libtool pkg-config make cmake \\',
    '    git openssh-client ca-certificates curl \\',
    '    libvips-dev libcairo2-dev libpango1.0-dev \\',
    '    libpng-dev libjpeg-dev libgif-dev librsvg2-dev \\',
    '    libfreetype6-dev fontconfig libpixman-1-dev \\',
    '    liblcms2-dev libwebp-dev nasm \\',
    '    python3 python3-pip \\',
    '    libpq-dev libffi-dev libssl-dev \\',
    '    zlib1g-dev \\',
    '    && rm -rf /var/lib/apt/lists/*',
    'ARG ROOT_DIR=.',
    'WORKDIR /app',
    '',
    '# ── Lockfile-first: copy ONLY lockfiles so deps layer is cached ──',
    'COPY --from=source /repo/${ROOT_DIR}/package.json ./package.json',
    'RUN --mount=type=bind,from=source,source=/repo,target=/src \\',
    '    for f in package-lock.json yarn.lock pnpm-lock.yaml bun.lockb .npmrc .yarnrc.yml; do \\',
    '      [ -f "/src/${ROOT_DIR}/$f" ] && cp "/src/${ROOT_DIR}/$f" ./ ; \\',
    '    done; true',
    '',
    '# ── Install dependencies with persistent caches ──',
    '# --ignore-scripts: Skip preinstall/postinstall (Vercel behavior)',
    'RUN --mount=type=cache,id=npm-' + projectId + ',target=/root/.npm \\',
    '    --mount=type=cache,id=yarn-' + projectId + ',target=/usr/local/share/.cache/yarn \\',
    '    --mount=type=cache,id=pnpm-' + projectId + ',target=/root/.local/share/pnpm/store \\',
    '    --mount=type=cache,id=node_modules-' + projectId + ',target=/app/node_modules \\',
    '    set -ex; \\',
    '    if [ -f package-lock.json ]; then npm ci --ignore-scripts || npm install --ignore-scripts || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); \\',
    '    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile --ignore-scripts || yarn install --ignore-scripts; \\',
    '    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile --ignore-scripts || pnpm install --ignore-scripts; \\',
    '    elif [ -f bun.lockb ]; then npx bun install --ignore-scripts; \\',
    '    elif [ -f package.json ]; then npm install --ignore-scripts || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); fi; \\',
    '    cp -a /app/node_modules /tmp/_node_modules 2>/dev/null || true',
    '',
    '# ── Copy full source (after deps are cached) ──',
    'COPY --from=source /repo/${ROOT_DIR}/ .',
    'RUN if [ -d /tmp/_node_modules ]; then rm -rf node_modules && mv /tmp/_node_modules node_modules; fi',
    '',
    '# ── Build with framework cache persistence ──',
    'ENV NODE_OPTIONS="--openssl-legacy-provider"',
    'ARG BUILD_CMD=""',
    'RUN --mount=type=cache,id=nextcache-' + projectId + ',target=/app/.next/cache \\',
    '    --mount=type=cache,id=buildcache-' + projectId + ',target=/app/.cache \\',
    '    set -e; \\',
    '    if [ -n "${BUILD_CMD}" ]; then \\',
    '      echo ">>> Running custom build: ${BUILD_CMD}"; \\',
    '      sh -c "${BUILD_CMD}"; \\',
    '    elif [ -f package.json ]; then \\',
    '      HAS_BUILD=$(node -e "var s=JSON.parse(require(\'fs\').readFileSync(\'package.json\',\'utf8\')).scripts||{}; var cmd=s.build||\'\'; if(!cmd||/\\\\b(ts-node-dev|tsx watch|nodemon|next dev|nuxt dev|vite dev|remix dev|ng serve)\\\\b/.test(cmd)){process.exit(1)} process.exit(0)" 2>/dev/null && echo yes || echo no); \\',
    '      if [ "$HAS_BUILD" = "yes" ]; then \\',
    '        echo ">>> Running: npm run build"; \\',
    '        npm run build; \\',
    '      else \\',
    '        echo ">>> No build script found (or dev-only), skipping build"; \\',
    '      fi; \\',
    '    fi',
    '',
    '# Auto-detect output directory for static assets',
    'ARG OUTPUT_DIR=""',
    'RUN set -e; \\',
    '    if [ -n "${OUTPUT_DIR}" ]; then \\',
    '      echo ">>> Using specified output dir: ${OUTPUT_DIR}"; \\',
    '      mkdir -p /static-output && cp -a "/app/${OUTPUT_DIR}/." /static-output/; \\',
    '    else \\',
    '      FOUND=""; \\',
    '      for d in build/static build dist out public/build .next/standalone .output/public; do \\',
    '        if [ -d "/app/$d" ]; then FOUND="$d"; break; fi; \\',
    '      done; \\',
    '      if [ -z "$FOUND" ]; then \\',
    '        echo "WARNING: No output directory detected, trying build/"; \\',
    '        FOUND="build"; \\',
    '      fi; \\',
    '      echo ">>> Auto-detected output dir: $FOUND"; \\',
    '      mkdir -p /static-output && cp -a "/app/$FOUND/." /static-output/; \\',
    '    fi',
    '',
    '# ---- Stage 3: Serve with nginx ----',
    'FROM nginx:alpine',
    'ARG APP_PORT=3000',
    '',
    '# Copy built static files into nginx',
    'COPY --from=builder /static-output/ /usr/share/nginx/html/',
    '',
    '# Generate nginx config with production security headers',
    'RUN printf "server {\\n  listen %s;\\n  listen [::]:%s;\\n  root /usr/share/nginx/html;\\n  index index.html;\\n  \\n  # Security headers (Vercel/Render grade)\\n  add_header X-Frame-Options \\"SAMEORIGIN\\" always;\\n  add_header X-Content-Type-Options \\"nosniff\\" always;\\n  add_header X-XSS-Protection \\"1; mode=block\\" always;\\n  add_header Referrer-Policy \\"strict-origin-when-cross-origin\\" always;\\n  add_header Permissions-Policy \\"camera=(), microphone=(), geolocation=()\\" always;\\n  \\n  # Remove nginx version\\n  server_tokens off;\\n  \\n  # SPA fallback\\n  location / {\\n    try_files \\$uri \\$uri/ /index.html;\\n  }\\n  \\n  # Static asset caching\\n  location ~* \\\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\\$ {\\n    expires 1y;\\n    add_header Cache-Control \\"public, immutable\\";\\n  }\\n}\\n" "${APP_PORT}" "${APP_PORT}" > /etc/nginx/conf.d/default.conf',
    '',
    'EXPOSE ${APP_PORT}',
    '# Clear default entrypoint (it tries to modify config files, fails with read-only)',
    'ENTRYPOINT []',
    'CMD ["nginx", "-g", "daemon off;"]',
  ].join('\n');
}

interface BuildImageInput {
  deploymentId: string;
  projectId: string;
  gitUrl: string;
  branch: string;
  commitSha?: string;
  rootDirectory?: string;
  buildCommand?: string;
  startCommand?: string;
  port: number;
  serviceType?: 'web_service' | 'static_site';
  outputDirectory?: string;
}

/** Patterns that indicate a dev-only start command — should not be used in production containers */
const DEV_CMD_PATTERNS = [
  /\brun\s+dev\b/i,
  /\bnodemon\b/i,
  /\bts-node\b/i,
  /\btsx\s+(watch|src)\b/i,
  /\bnext\s+dev\b/i,
  /\bvite\s+dev\b/i,
  /\bnuxt\s+dev\b/i,
];

function isDevCommand(cmd: string): boolean {
  return DEV_CMD_PATTERNS.some((p) => p.test(cmd));
}

interface RunContainerInput {
  imageTag: string;
  port: number;
  env: Record<string, string>;
  memoryMb: number;
  cpuMillicores: number;
  deploymentId: string;
}

export class DockerAdapter {
  /**
   * Build a Docker image entirely inside Docker — git clone, dependency
   * install, and build all happen in containerised stages.  The only
   * thing written to the host is a tiny temp directory with the generated
   * Dockerfile (no repo checkout on the host).
   */
  async buildImage(input: BuildImageInput, onLog?: LogCallback): Promise<string> {
    const imageTag = `apployd/${input.deploymentId}:latest`;

    // Wrap log callback to sanitize sensitive data
    const safeLog: LogCallback | undefined = onLog
      ? (msg) => onLog(sanitizeLog(msg))
      : undefined;

    // Minimal build-context: just our generated Dockerfile
    const ctxDir = await mkdtemp(join(tmpdir(), 'apployd-ctx-'));

    try {
      // Validate rootDirectory to prevent path traversal
      if (input.rootDirectory && (input.rootDirectory.includes('..') || input.rootDirectory.startsWith('/'))) {
        throw new Error('Invalid rootDirectory: must be a relative path without ".."');
      }

      // Sanitize git URL to remove credentials if present
      const sanitizedGitUrl = input.gitUrl.replace(
        /:\/\/([^:]+):([^@]+)@/,
        '://[REDACTED]:[REDACTED]@',
      );

      await writeFile(join(ctxDir, 'Dockerfile'), universalDockerfile(input.serviceType, input.projectId), 'utf8');

      const isStatic = input.serviceType === 'static_site';

      // Assemble --build-arg flags
      const args: string[] = [
        `--build-arg GIT_URL=${shellEscape(input.gitUrl)}`,
        `--build-arg GIT_BRANCH=${shellEscape(input.branch)}`,
        `--build-arg APP_PORT=${input.port}`,
      ];
      if (input.commitSha) args.push(`--build-arg GIT_SHA=${shellEscape(input.commitSha)}`);
      if (input.rootDirectory) args.push(`--build-arg ROOT_DIR=${shellEscape(input.rootDirectory)}`);
      if (input.buildCommand) args.push(`--build-arg BUILD_CMD=${shellEscape(input.buildCommand)}`);
      if (!isStatic && input.startCommand) {
        if (isDevCommand(input.startCommand)) {
          safeLog?.(`Ignoring dev-mode start command "${input.startCommand}" — auto-detecting production command instead`);
        } else {
          args.push(`--build-arg START_CMD=${shellEscape(input.startCommand)}`);
        }
      }
      if (isStatic && input.outputDirectory) args.push(`--build-arg OUTPUT_DIR=${shellEscape(input.outputDirectory)}`);

      safeLog?.(`Building ${isStatic ? 'static site' : 'web service'} image from ${sanitizedGitUrl} (${input.branch})...`);
      // Use BuildKit for cache mounts — dramatically speeds up rebuilds
      // DOCKER_BUILDKIT=1 enables BuildKit; --progress=plain streams full logs
      await runCommandStreaming(
        `DOCKER_BUILDKIT=1 docker build --progress=plain ${args.join(' ')} -t ${shellEscape(imageTag)} ${shellEscape(ctxDir)}`,
        safeLog,
      );
      safeLog?.('Docker image built successfully');

      return imageTag;
    } finally {
      await rm(ctxDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async runContainer(input: RunContainerInput): Promise<{ dockerContainerId: string; hostPort: number }> {
    const hostPort = this.allocateHostPort();
    const memoryLimit = `${input.memoryMb}m`;
    const cpuQuota = Math.floor((input.cpuMillicores / 1000) * 100000);

    try {
      await runCommand('docker network inspect apployd-net');
    } catch {
      await runCommand('docker network create apployd-net');
    }

    const envArgs = Object.entries(input.env)
      .map(([k, v]) => `-e ${shellEscape(`${k}=${v}`)}`)
      .join(' ');

    const cmd = [
      'docker run -d',
      `--name apployd-${input.deploymentId}`,
      '--restart unless-stopped',
      
      // ── Security: Read-only filesystem (Vercel/Render grade) ──
      '--read-only',
      '--tmpfs /tmp:rw,noexec,nosuid,size=512m',
      '--tmpfs /run:rw,noexec,nosuid,size=64m',
      '--tmpfs /var/run:rw,noexec,nosuid,size=64m',
      // Node.js runtime dirs
      '--tmpfs /app/.npm:rw,noexec,nosuid,size=256m',
      '--tmpfs /app/.cache:rw,noexec,nosuid,size=256m',
      '--tmpfs /app/node_modules/.cache:rw,noexec,nosuid,size=256m',
      // nginx runtime dirs (required for read-only with nginx:alpine)
      '--tmpfs /var/cache/nginx:rw,noexec,nosuid,size=128m',
      '--tmpfs /var/log/nginx:rw,noexec,nosuid,size=64m',
      '--tmpfs /var/lib/nginx:rw,noexec,nosuid,size=64m',
      // Next.js/framework cache dirs
      '--tmpfs /app/.next:rw,noexec,nosuid,size=512m',
      '--tmpfs /app/.nuxt:rw,noexec,nosuid,size=256m',
      '--tmpfs /app/.output:rw,noexec,nosuid,size=256m',
      
      // ── Security: Capability drops & isolation ──
      '--security-opt no-new-privileges:true',
      '--cap-drop ALL',
      '--cap-add NET_BIND_SERVICE',
      '--cap-add CHOWN',
      '--cap-add SETUID',
      '--cap-add SETGID',
      
      // ── Security: Process limits (prevent fork bombs) ──
      '--pids-limit 256',
      '--ulimit nofile=4096:8192',
      '--ulimit nproc=256:512',
      
      // ── Network & Resource isolation ──
      '--network apployd-net',
      '--network-alias',
      `deployment-${input.deploymentId}`,
      `--memory ${memoryLimit}`,
      '--memory-swap',
      memoryLimit, // No swap usage
      '--oom-kill-disable=false',
      `--cpu-period 100000 --cpu-quota ${cpuQuota}`,
      
      // ── Port mapping ──
      `-p 127.0.0.1:${hostPort}:${input.port}`,
      
      // ── Environment variables (sanitized) ──
      envArgs,
      
      input.imageTag,
    ].join(' ');

    const dockerContainerId = await runCommand(cmd);
    return { dockerContainerId, hostPort };
  }

  async stopContainer(containerNameOrId: string): Promise<void> {
    await runCommand(`docker stop ${shellEscape(containerNameOrId)}`).catch(() => undefined);
  }

  async startContainer(containerNameOrId: string): Promise<void> {
    await runCommand(`docker start ${shellEscape(containerNameOrId)}`).catch(() => undefined);
  }

  /**
   * Polls the container's mapped port until it responds (HTTP or raw TCP).
   * Max 30 seconds.  Detects early container exits and streams progress.
   */
  async healthCheck(
    hostPort: number,
    _containerPort: number,
    containerId?: string,
    onLog?: LogCallback,
  ): Promise<boolean> {
    const maxAttempts = 30;
    const delayMs = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      // ── Early exit: check if container is still running ──
      // Check every attempt for the first 5, then every 5th after that
      if (containerId && (i < 5 || i % 5 === 0)) {
        try {
          const state = await runCommand(
            `docker inspect --format={{.State.Running}} ${containerId}`,
          );
          if (state.trim() === 'false') {
            onLog?.(`Health check: container exited prematurely (attempt ${i + 1}/${maxAttempts})`);
            return false;
          }
        } catch {
          // inspect failed — container may have been removed
          onLog?.('Health check: unable to inspect container — it may have crashed');
          return false;
        }
      }

      // ── Try HTTP first ──
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://127.0.0.1:${hostPort}/`, {
          signal: controller.signal,
          redirect: 'manual',
        });
        clearTimeout(timeout);
        // Any response (even 404/500) means the process is listening
        if (res.status > 0) {
          onLog?.(`Health check passed (HTTP ${res.status} on attempt ${i + 1})`);
          return true;
        }
      } catch {
        // Connection refused or timeout — try raw TCP
      }

      // ── TCP fallback (some apps don't speak HTTP on /) ──
      const tcpOk = await this.tcpProbe(hostPort);
      if (tcpOk) {
        onLog?.(`Health check passed (TCP on attempt ${i + 1})`);
        return true;
      }

      if (i % 5 === 0) {
        onLog?.(`Health check: waiting for port ${hostPort}… (attempt ${i + 1}/${maxAttempts})`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }

    onLog?.('Health check: timed out after 30 seconds');
    return false;
  }

  /**
   * Attempts a raw TCP connection to the given port.
   * Resolves true if we can connect, false otherwise.
   */
  private tcpProbe(port: number, timeoutMs = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
          socket.destroy();
          resolve(true);
        });
        socket.setTimeout(timeoutMs);
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Retrieves the last N lines of a container's logs.
   */
  async getContainerLogs(containerNameOrId: string, tailLines = 50): Promise<string> {
    try {
      return await runCommand(`docker logs --tail ${tailLines} ${containerNameOrId}`);
    } catch {
      return '(unable to retrieve container logs)';
    }
  }

  private allocateHostPort(): number {
    return randomInt(20000, 45000);
  }
}
