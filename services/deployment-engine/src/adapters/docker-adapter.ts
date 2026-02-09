import { randomInt } from 'crypto';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import net from 'net';
import { tmpdir } from 'os';
import { join } from 'path';

import { runCommand, runCommandStreaming, type LogCallback } from '../core/run-command.js';

const shellEscape = (value: string) =>
  process.platform === 'win32' ? `"${value.replace(/"/g, '\\"')}"` : `'${value.replace(/'/g, `'\"'\"'`)}'`;

/**
 * Universal multi-stage Dockerfile.
 *
 * Stage 1 — alpine/git clones the repo INSIDE Docker (no host git needed,
 *           no Windows-vs-Linux path quoting issues).
 * Stage 2 — node:20-bookworm-slim (with Python added) auto-detects the
 *           runtime from the repo contents, installs deps, runs the build
 *           command, and writes the start entrypoint.
 *
 * Everything is parameterised through Docker build-args so the same
 * Dockerfile works for every project.
 */
function universalDockerfile(serviceType: 'web_service' | 'static_site' = 'web_service'): string {
  if (serviceType === 'static_site') {
    return staticSiteDockerfile();
  }
  return webServiceDockerfile();
}

/**
 * Dockerfile for backend / web service projects.
 * Auto-detects runtime, installs deps, builds, and runs the start command.
 */
function webServiceDockerfile(): string {
  return [
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
    '    # Core build tools',
    '    build-essential autoconf automake libtool pkg-config make cmake \\',
    '    git openssh-client ca-certificates \\',
    '    # Python runtime and development',
    '    python3 python3-pip python3-venv python3-dev \\',
    '    # Image processing (sharp, node-canvas, Pillow, gifsicle)',
    '    libvips-dev libcairo2-dev libpango1.0-dev \\',
    '    libpng-dev libjpeg-dev libgif-dev librsvg2-dev \\',
    '    libfreetype6-dev fontconfig libpixman-1-dev \\',
    '    # Database drivers (PostgreSQL, MySQL)',
    '    libpq-dev default-libmysqlclient-dev \\',
    '    # Crypto and SSL (cryptography, cffi, bcrypt)',
    '    libffi-dev libssl-dev \\',
    '    # XML/HTML parsing (lxml, beautifulsoup)',
    '    libxml2-dev libxslt-dev \\',
    '    # Compression and utilities',
    '    zlib1g-dev \\',
    '    && rm -rf /var/lib/apt/lists/*',
    '',
    'ARG ROOT_DIR=.',
    'WORKDIR /app',
    'COPY --from=source /repo/${ROOT_DIR}/ .',
    '',
    '# Auto-detect runtime & install dependencies',
    'RUN set -ex; \\',
    '    if [ -f package-lock.json ]; then npm ci --verbose || npm install --verbose || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); \\',
    '    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile || yarn install; \\',
    '    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile || pnpm install; \\',
    '    elif [ -f bun.lockb ]; then npx bun install; \\',
    '    elif [ -f package.json ]; then npm install --verbose || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); fi; \\',
    '    if [ -f requirements.txt ]; then pip3 install --no-cache-dir --break-system-packages -r requirements.txt; \\',
    '    elif [ -f Pipfile ]; then pip3 install --break-system-packages pipenv && pipenv install --system --deploy; \\',
    '    elif [ -f pyproject.toml ]; then pip3 install --no-cache-dir --break-system-packages .; fi',
    '',
    '# Universal build: explicit command > package.json "build" script > skip',
    '# Enable legacy OpenSSL for older webpack/babel projects (e.g. CRA v4, webpack 4)',
    'ENV NODE_OPTIONS="--openssl-legacy-provider"',
    'ARG BUILD_CMD=""',
    'RUN set -e; \\',
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
function staticSiteDockerfile(): string {
  return [
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
    '# Install comprehensive native dependencies for Node.js',
    'RUN apt-get update && apt-get install -y --no-install-recommends \\',
    '    # Core build tools',
    '    build-essential autoconf automake libtool pkg-config make cmake \\',
    '    git openssh-client ca-certificates \\',
    '    # Image processing (sharp, node-canvas, imagemin-*, gifsicle)',
    '    libvips-dev libcairo2-dev libpango1.0-dev \\',
    '    libpng-dev libjpeg-dev libgif-dev librsvg2-dev \\',
    '    libfreetype6-dev fontconfig libpixman-1-dev \\',
    '    # Python (for node-gyp, some build scripts)',
    '    python3 python3-pip \\',
    '    # Database and crypto libs',
    '    libpq-dev libffi-dev libssl-dev \\',
    '    # Compression',
    '    zlib1g-dev \\',
    '    && rm -rf /var/lib/apt/lists/*',
    'ARG ROOT_DIR=.',
    'WORKDIR /app',
    'COPY --from=source /repo/${ROOT_DIR}/ .',
    '',
    'RUN set -ex; \\',
    '    if [ -f package-lock.json ]; then npm ci --verbose || npm install --verbose || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); \\',
    '    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile || yarn install; \\',
    '    elif [ -f pnpm-lock.yaml ]; then corepack enable && pnpm install --frozen-lockfile || pnpm install; \\',
    '    elif [ -f bun.lockb ]; then npx bun install; \\',
    '    elif [ -f package.json ]; then npm install --verbose || (echo "=== NPM ERROR LOGS ===" && cat ~/.npm/_logs/*.log 2>/dev/null && exit 1); fi',
    '',
    '# Universal build: explicit command > package.json "build" script > skip',
    'ENV NODE_OPTIONS="--openssl-legacy-provider"',
    'ARG BUILD_CMD=""',
    'RUN set -e; \\',
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
    '# Generate nginx config for the custom port + SPA fallback',
    'RUN printf "server {\\n  listen %s;\\n  listen [::]:%s;\\n  root /usr/share/nginx/html;\\n  index index.html;\\n  location / {\\n    try_files \\$uri \\$uri/ /index.html;\\n  }\\n  location ~* \\\\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)\\$ {\\n    expires 1y;\\n    add_header Cache-Control \\"public, immutable\\";\\n  }\\n}\\n" "${APP_PORT}" "${APP_PORT}" > /etc/nginx/conf.d/default.conf',
    '',
    'EXPOSE ${APP_PORT}',
    'CMD ["nginx", "-g", "daemon off;"]',
  ].join('\n');
}

interface BuildImageInput {
  deploymentId: string;
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

    // Minimal build-context: just our generated Dockerfile
    const ctxDir = await mkdtemp(join(tmpdir(), 'apployd-ctx-'));

    try {
      // Validate rootDirectory to prevent path traversal
      if (input.rootDirectory && (input.rootDirectory.includes('..') || input.rootDirectory.startsWith('/'))) {
        throw new Error('Invalid rootDirectory: must be a relative path without ".."');
      }

      await writeFile(join(ctxDir, 'Dockerfile'), universalDockerfile(input.serviceType), 'utf8');

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
          onLog?.(`Ignoring dev-mode start command "${input.startCommand}" — auto-detecting production command instead`);
        } else {
          args.push(`--build-arg START_CMD=${shellEscape(input.startCommand)}`);
        }
      }
      if (isStatic && input.outputDirectory) args.push(`--build-arg OUTPUT_DIR=${shellEscape(input.outputDirectory)}`);

      onLog?.(`Building ${isStatic ? 'static site' : 'web service'} image (clone → install → build${isStatic ? ' → nginx' : ''}) ...`);
      await runCommandStreaming(
        `docker build --no-cache ${args.join(' ')} -t ${shellEscape(imageTag)} ${shellEscape(ctxDir)}`,
        onLog,
      );
      onLog?.('Docker image built successfully');

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
      '--read-only',
      '--tmpfs /tmp:rw,noexec,nosuid',
      '--tmpfs /app/__pycache__:rw,noexec,nosuid',
      // nginx needs writable cache/pid/log dirs (harmless no-op on non-nginx images)
      '--tmpfs /var/cache/nginx:rw,noexec,nosuid',
      '--tmpfs /var/run:rw,noexec,nosuid',
      '--tmpfs /var/log/nginx:rw,noexec,nosuid',
      '--network apployd-net',
      `--memory ${memoryLimit}`,
      `--cpu-period 100000 --cpu-quota ${cpuQuota}`,
      `-p ${hostPort}:${input.port}`,
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
