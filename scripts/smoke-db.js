import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app.js';
import prisma from '../src/lib/prisma.js';
const suffix = randomUUID();
const emails = [
  `smoke-a-${suffix}@example.com`,
  `smoke-b-${suffix}@example.com`,
];
const password = `Smoke1-${randomUUID()}`;
const clientIp = `2001:db8:${randomUUID().replaceAll('-', '').slice(0, 24).match(/.{4}/g).join(':')}`;
const auth = (method, path, token) =>
  request(app)[method](path).set('Authorization', `Bearer ${token}`);
try {
  const accounts = [];
  for (const email of emails) {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email, password });
    assert.equal(response.status, 201, 'Database-backed registration failed');
    accounts.push(response.body);
  }
  const [a, b] = accounts;
  const login = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-For', clientIp)
    .send({ email: emails[0], password });
  assert.equal(login.status, 200);
  assert.equal(
    (await auth('get', '/api/auth/me', login.body.token)).body.user.id,
    a.user.id,
  );
  const created = await auth('post', '/api/notes', b.token).send({
    title: 'Database smoke test',
    content: 'Temporary verification data',
  });
  assert.equal(created.status, 201);
  const path = `/api/notes/${created.body.note.id}`;
  assert.equal((await auth('get', path, a.token)).status, 404);
  assert.equal(
    (await auth('patch', path, a.token).send({ title: 'Denied' })).status,
    404,
  );
  assert.equal((await auth('delete', path, a.token)).status, 404);
  assert.equal((await auth('get', '/api/notes', a.token)).body.notes.length, 0);
  assert.equal(
    (await auth('patch', path, b.token).send({ title: 'Owner update' })).status,
    200,
  );
  await prisma.user.update({
    where: { id: a.user.id },
    data: { role: 'ADMIN' },
  });
  const adminList = await auth('get', '/api/notes?limit=100', a.token);
  assert.equal(adminList.status, 200);
  assert.equal((await auth('get', path, a.token)).status, 200);
  assert.equal(
    (await auth('patch', path, a.token).send({ content: 'Admin update' }))
      .status,
    200,
  );
  assert.equal((await auth('delete', path, a.token)).status, 204);
  process.stdout.write(
    'Database smoke test passed: auth, scoped CRUD, admin access, and atomic writes.\n',
  );
} finally {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
}
