import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/core/env.js', () => ({
  env: {
    ENGINE_SECURITY_MODE: 'monitor',
    ENGINE_BUILD_TIMEOUT_SECONDS: 1800,
  },
}));

vi.mock('../src/core/run-command.js', () => ({
  runCommand: vi.fn(async () => ''),
  runCommandStreaming: vi.fn(async () => undefined),
}));

import { DockerAdapter, universalDockerfile } from '../src/adapters/docker-adapter.js';
import { runCommandStreaming } from '../src/core/run-command.js';

describe('universalDockerfile root directory handling', () => {
  it('resolves Node roots in the source stage before dependency files are copied', () => {
    const dockerfile = universalDockerfile('web_service', 'project-123');

    expect(dockerfile).toContain('Requested root directory ${requested} does not contain package.json');
    expect(dockerfile).toContain('Continuing with repository root.');
    expect(dockerfile).toContain('Restore workspace package manifests so repo-root installs can resolve app dependencies');
    expect(dockerfile).toContain('"/repo-source/apps/*/package.json"');
    expect(dockerfile).toContain('[ -f /src/package.json ] && cp /src/package.json ./package.json || true;');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/ .');
    expect(dockerfile).not.toContain('COPY --from=source /apployd-target/package.json ./package.json');
    expect(dockerfile).not.toContain('exit 1;');
  });

  it('applies the same source-stage root resolution to static sites', () => {
    const dockerfile = universalDockerfile('static_site', 'project-123');

    expect(dockerfile).toContain('does not contain a static app root');
    expect(dockerfile).toContain('Restore workspace package manifests so repo-root installs can resolve app dependencies');
    expect(dockerfile).toContain('[ -f /src/package.json ] && cp /src/package.json ./package.json || true;');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/ .');
    expect(dockerfile).not.toContain('COPY --from=source /apployd-target/package.json ./package.json');
    expect(dockerfile).not.toContain('COPY --from=source /repo/${ROOT_DIR}/ .');
  });

  it('lets static sites fall back to serving repository-root html when no build output exists', () => {
    const dockerfile = universalDockerfile('static_site', 'project-123');

    expect(dockerfile).toContain('if [ -f "/app/index.html" ]; then FOUND="."; fi;');
    expect(dockerfile).toContain('if [ -z "$FOUND" ] && [ -f "/app/public/index.html" ]; then FOUND="public"; fi;');
    expect(dockerfile).toContain('WARNING: No output directory detected, serving repository root');
    expect(dockerfile).not.toContain('WARNING: No output directory detected, trying build/');
  });

  it('copies Python sources from the resolved source target instead of the raw root path', () => {
    const dockerfile = universalDockerfile('python', 'project-123');

    expect(dockerfile).toContain('Requested root directory ${requested} does not look like a Python app');
    expect(dockerfile).toContain('--mount=type=bind,from=source,source=/apployd-target,target=/src');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/ .');
    expect(dockerfile).not.toContain('COPY --from=source /repo/${ROOT_DIR}/ .');
  });

  it('lets web_service projects serve plain static html when no app server exists', () => {
    const dockerfile = universalDockerfile('web_service', 'project-123');

    expect(dockerfile).toContain('Detected static site content');
    expect(dockerfile).toContain('exec python3 -m http.server ${PORT:-3000} --bind 0.0.0.0');
  });
});

describe('DockerAdapter build behavior', () => {
  it('passes configured build timeout to docker build command', async () => {
    const adapter = new DockerAdapter();

    await adapter.buildImage({
      deploymentId: 'cm00000000000000000000001',
      projectId: 'cm00000000000000000000002',
      gitUrl: 'https://github.com/example/repo.git',
      branch: 'main',
      port: 3000,
      serviceType: 'web_service',
    });

    expect(runCommandStreaming).toHaveBeenCalled();
    const thirdArg = (runCommandStreaming as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as
      | { timeoutMs?: number }
      | undefined;
    expect(thirdArg?.timeoutMs).toBe(1_800_000);
  });
});
