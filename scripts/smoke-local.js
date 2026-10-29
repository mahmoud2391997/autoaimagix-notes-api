import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { Redis } from '@upstash/redis';
import prisma from '../src/lib/prisma.js';
const loopback = (value) =>
  ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
assert.ok(
  loopback(process.env.DATABASE_URL),
  'Local smoke test requires loopback PostgreSQL',
);
assert.ok(
  loopback(process.env.UPSTASH_REDIS_REST_URL),
  'Local smoke test requires loopback Redis REST',
);
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
const ip = `2001:db8:${randomBytes(12).toString('hex').match(/.{4}/g).join(':')}`;
const email = `local-stack-${randomUUID()}@example.com`;
const password = `Local1-${randomUUID()}`;
const children = [];
const keys = () => redis.keys(`notes:login:${ip}:*`);
async function start() {
  const child = spawn(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      "import app from './src/app.js';const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));",
    ],
    { env: process.env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  );
  children.push(child);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Local API startup timed out')),
      20000,
    );
    child.once('message', ({ port }) => {
      clearTimeout(timeout);
      resolve(`http://127.0.0.1:${port}`);
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      if (code) reject(new Error(`Local API exited with ${code}`));
    });
  });
}
async function call(base, method, path, body, token) {
  const response = await fetch(base + path, {
    method,
    headers: {
      'X-Forwarded-For': ip,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: response.status,
    body: response.status === 204 ? null : await response.json(),
    headers: response.headers,
  };
}
try {
  assert.equal(await redis.ping(), 'PONG');
  const unauthorized = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer invalid-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['PING']),
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(unauthorized.status, 401);
  const first = await start();
  const second = await start();
  const registered = await call(first, 'POST', '/api/auth/register', {
    email,
    password,
  });
  assert.equal(registered.status, 201);
  const login = await call(first, 'POST', '/api/auth/login', {
    email,
    password,
  });
  assert.equal(login.status, 200);
  const token = login.body.token;
  assert.equal(
    (await call(second, 'GET', '/api/auth/me', null, token)).body.user.email,
    email,
  );
  const note = await call(
    first,
    'POST',
    '/api/notes',
    { title: 'Local stack', content: 'Shared PostgreSQL' },
    token,
  );
  assert.equal(note.status, 201);
  const path = `/api/notes/${note.body.note.id}`;
  assert.equal((await call(second, 'GET', path, null, token)).status, 200);
  assert.equal(
    (
      await call(
        second,
        'PATCH',
        path,
        { title: 'Updated across instances' },
        token,
      )
    ).status,
    200,
  );
  assert.equal((await call(first, 'DELETE', path, null, token)).status, 204);
  for (let attempt = 2; attempt <= 6; attempt++) {
    const response = await call(
      attempt % 2 ? first : second,
      'POST',
      '/api/auth/login',
      { email, password: 'incorrect' },
    );
    assert.equal(response.status, attempt === 6 ? 429 : 401);
    if (attempt === 6) {
      assert.equal(response.headers.get('ratelimit-limit'), '5');
      assert.ok(Number(response.headers.get('retry-after')) > 0);
    }
  }
  assert.ok(
    (await keys()).length > 0,
    'Login counters must actually exist in local Redis',
  );
  console.log(
    'PASS: local PostgreSQL and Redis REST; authenticated bridge; shared CRUD and login limits across two separate API processes.',
  );
} finally {
  for (const child of children) child.kill('SIGTERM');
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
  const ownedKeys = await keys();
  if (ownedKeys.length) await redis.del(...ownedKeys);
}
