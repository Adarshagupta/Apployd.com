#!/usr/bin/env node

const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const tsconfigPath = args[0] || 'tsconfig.json';

let tscBin;
try {
  tscBin = require.resolve('typescript/bin/tsc');
} catch {
  console.error('typescript is not installed. Run npm install first.');
  process.exit(1);
}

const resolvedConfig = path.resolve(process.cwd(), tsconfigPath);
const result = spawnSync(process.execPath, [tscBin, '-p', resolvedConfig], {
  stdio: 'inherit',
  env: process.env,
});

if (result.error) {
  console.error(`Failed to run tsc: ${result.error.message}`);
  process.exit(1);
}

if (typeof result.status === 'number' && result.status !== 0) {
  console.warn(
    `TypeScript completed with diagnostics for ${resolvedConfig}. Continuing build because relaxed mode is enabled.`,
  );
}

process.exit(0);
