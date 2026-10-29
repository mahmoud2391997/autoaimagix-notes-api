import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
const password = randomBytes(24).toString('hex');
const redisToken = randomBytes(32).toString('hex');
const contents = `NODE_ENV=development
PORT=3000
LOCAL_POSTGRES_PASSWORD=${password}
DATABASE_URL=postgresql://notesapi:${password}@127.0.0.1:5433/notesapi?schema=public
JWT_SECRET=${randomBytes(32).toString('hex')}
JWT_EXPIRES_IN=1h
OPENWEATHER_API_KEY=your-openweathermap-key
CORS_ORIGINS=http://localhost:3000
LOCAL_REDIS_TOKEN=${redisToken}
UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
UPSTASH_REDIS_REST_TOKEN=${redisToken}
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin1-${randomBytes(24).toString('hex')}
`;
try {
  writeFileSync(new URL('../.env', import.meta.url), contents, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write('Created .env with random local credentials.\n');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  const file = new URL('../.env', import.meta.url);
  let existing = readFileSync(file, 'utf8');
  const values = parse(existing);
  const localToken = values.LOCAL_REDIS_TOKEN || redisToken;
  const defaults = {
    LOCAL_REDIS_TOKEN: localToken,
    UPSTASH_REDIS_REST_URL: 'http://127.0.0.1:8079',
    UPSTASH_REDIS_REST_TOKEN: localToken,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (values[key]) continue;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    existing = pattern.test(existing)
      ? existing.replace(pattern, `${key}=${value}`)
      : `${existing.trimEnd()}\n${key}=${value}\n`;
  }
  writeFileSync(file, existing, { mode: 0o600 });
  process.stdout.write(
    'Preserved existing configuration and filled missing local Redis settings.\n',
  );
}
