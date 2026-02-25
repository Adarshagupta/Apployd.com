const { spawnSync } = require('child_process');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/prisma-run.cjs <prisma args>');
  process.exit(1);
}

const env = { ...process.env };

// Keep commands working even when DIRECT_DATABASE_URL is not explicitly set.
if (!env.DIRECT_DATABASE_URL && env.DATABASE_URL) {
  env.DIRECT_DATABASE_URL = env.DATABASE_URL;
}

// For migration-style commands, prefer direct DB URL to avoid advisory lock issues on poolers.
if (
  env.DIRECT_DATABASE_URL
  && (args[0] === 'migrate' || args[0] === 'db')
) {
  env.DATABASE_URL = env.DIRECT_DATABASE_URL;
}

const result = spawnSync('prisma', args, {
  stdio: 'inherit',
  env,
  shell: true,
});

if (result.error) {
  console.error(result.error.message);
}

if (typeof result.status === 'number') {
  process.exit(result.status);
}

process.exit(1);
