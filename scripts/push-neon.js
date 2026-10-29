import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';
config({ path: '.env.neon', override: true });
const direct = process.env.DATABASE_URL_UNPOOLED;
if (!direct)
  throw new Error(
    'Set DATABASE_URL_UNPOOLED in .env.neon before applying the remote schema',
  );
const url = new URL(direct);
if (
  !['postgres:', 'postgresql:'].includes(url.protocol) ||
  url.hostname.includes('-pooler')
)
  throw new Error(
    'Remote schema setup requires a direct PostgreSQL connection',
  );
const result = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'db', 'push'],
  { stdio: 'inherit', env: { ...process.env, DATABASE_URL: direct } },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
