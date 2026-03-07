import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/core/env.js', () => ({
  env: {
    ENGINE_SECURITY_MODE: 'monitor',
  },
}));

vi.mock('../src/core/run-command.js', () => ({
  runCommand: vi.fn(async () => ''),
  runCommandStreaming: vi.fn(async () => undefined),
}));

import { universalDockerfile } from '../src/adapters/docker-adapter.js';

describe('universalDockerfile root directory handling', () => {
  it('resolves Node roots in the source stage before package.json is copied', () => {
    const dockerfile = universalDockerfile('web_service', 'project-123');

    expect(dockerfile).toContain('Requested root directory ${requested} does not contain package.json');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/package.json ./package.json');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/ .');
    expect(dockerfile).not.toContain('COPY --from=source /repo/${ROOT_DIR}/package.json ./package.json');
  });

  it('applies the same source-stage root resolution to static sites', () => {
    const dockerfile = universalDockerfile('static_site', 'project-123');

    expect(dockerfile).toContain('auto-detected ${auto_dir}');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/package.json ./package.json');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/ .');
    expect(dockerfile).not.toContain('COPY --from=source /repo/${ROOT_DIR}/ .');
  });

  it('copies Python sources from the resolved source target instead of the raw root path', () => {
    const dockerfile = universalDockerfile('python', 'project-123');

    expect(dockerfile).toContain('Requested root directory ${requested} does not look like a Python app');
    expect(dockerfile).toContain('--mount=type=bind,from=source,source=/apployd-target,target=/src');
    expect(dockerfile).toContain('COPY --from=source /apployd-target/ .');
    expect(dockerfile).not.toContain('COPY --from=source /repo/${ROOT_DIR}/ .');
  });
});
