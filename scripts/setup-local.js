import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const password = randomBytes(24).toString('hex');
const contents = `NODE_ENV=development
PORT=3000
LOCAL_POSTGRES_PASSWORD=${password}
DATABASE_URL=postgresql://notesapi:${password}@127.0.0.1:5433/notesapi?schema=public
JWT_SECRET=${randomBytes(32).toString('hex')}
JWT_EXPIRES_IN=1h
OPENWEATHER_API_KEY=replace-with-your-openweathermap-key
CORS_ORIGINS=http://localhost:3000
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=Admin1-${randomBytes(24).toString('hex')}
`;
try {
  writeFileSync(new URL('../.env', import.meta.url), contents, {
    flag: 'wx',
    mode: 0o600,
  });
  process.stdout.write(
    'Created .env with random local credentials. Configure the weather key before using weather.\n',
  );
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  process.stdout.write('.env already exists; kept existing configuration.\n');
}
