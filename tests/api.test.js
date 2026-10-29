import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
const { db, users, notes } = vi.hoisted(() => {
  const users = [];
  const notes = [];
  const match = (row, where) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const pick = (row, select) =>
    row
      ? Object.fromEntries(
          Object.keys(select)
            .filter((key) => select[key])
            .map((key) => [key, row[key]]),
        )
      : null;
  const db = {
    user: {
      create: vi.fn(async ({ data, select }) => {
        if (users.some((u) => u.email === data.email))
          throw Object.assign(new Error('private db error'), { code: 'P2002' });
        const row = {
          ...data,
          id: `c${String(users.length + 1).padStart(24, '0')}`,
          createdAt: new Date().toISOString(),
        };
        users.push(row);
        return pick(row, select);
      }),
      findUnique: vi.fn(async ({ where, select }) =>
        pick(
          users.find((u) => match(u, where)),
          select,
        ),
      ),
    },
    note: {
      create: vi.fn(async ({ data }) => {
        const row = {
          ...data,
          id: `c${String(notes.length + 101).padStart(24, '0')}`,
        };
        notes.push(row);
        return { ...row };
      }),
      findFirst: vi.fn(
        async ({ where }) => notes.find((n) => match(n, where)) ?? null,
      ),
      findMany: vi.fn(async ({ where, skip, take, include }) =>
        notes
          .filter((n) => match(n, where))
          .slice(skip, skip + take)
          .map((n) => ({
            ...n,
            ...(include
              ? {
                  owner: { email: users.find((u) => u.id === n.ownerId).email },
                }
              : {}),
          })),
      ),
      count: vi.fn(
        async ({ where }) => notes.filter((n) => match(n, where)).length,
      ),
      updateManyAndReturn: vi.fn(async ({ where, data }) => {
        const row = notes.find((n) => match(n, where));
        if (!row) return [];
        Object.assign(row, data);
        return [{ ...row }];
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const index = notes.findIndex((n) => match(n, where));
        if (index < 0) return { count: 0 };
        notes.splice(index, 1);
        return { count: 1 };
      }),
    },
    $transaction: vi.fn((queries) => Promise.all(queries)),
  };
  return { db, users, notes };
});
vi.mock('../src/lib/prisma.js', () => ({ default: db }));
import app from '../src/app.js';
let ip = 0;
const call = (method, path, token, client = ++ip) => {
  const clientRequest = request(app);
  const req = clientRequest[method](path).set(
    'X-Forwarded-For',
    `192.0.2.${(client % 250) + 1}`,
  );
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const account = async (email = 'a@example.com', extra = {}) => {
  const response = await call('post', '/api/auth/register').send({
    email,
    password: 'SecurePassword1',
    ...extra,
  });
  expect(response.status).toBe(201);
  return response.body;
};
beforeEach(() => {
  users.length = 0;
  notes.length = 0;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
describe('authentication', () => {
  it('registers, logs in and reloads /me; ignores registration role', async () => {
    const { user, token } = await account(' A@example.com ', { role: 'ADMIN' });
    expect(user).toMatchObject({ email: 'a@example.com', role: 'USER' });
    expect(JSON.stringify(user)).not.toContain('password');
    expect(bcrypt.getRounds(users[0].passwordHash)).toBe(12);
    const claims = jwt.decode(token);
    expect(claims.exp - claims.iat).toBe(3600);
    const login = await call('post', '/api/auth/login').send({
      email: 'a@example.com',
      password: 'SecurePassword1',
    });
    expect(login.status).toBe(200);
    expect(
      (await call('get', '/api/auth/me', login.body.token)).body.user.id,
    ).toBe(user.id);
    expect(
      (
        await call('post', '/api/auth/register').send({
          email: 'a@example.com',
          password: 'SecurePassword1',
        })
      ).status,
    ).toBe(409);
  });
  it('returns identical errors for incorrect password and unknown account, comparing both hashes', async () => {
    await account();
    const compare = vi.spyOn(bcrypt, 'compare');
    const wrong = await call('post', '/api/auth/login').send({
      email: 'a@example.com',
      password: 'Wrong1',
    });
    const unknown = await call('post', '/api/auth/login').send({
      email: 'unknown@example.com',
      password: 'Wrong1',
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(compare).toHaveBeenCalledTimes(2);
    expect(bcrypt.getRounds(compare.mock.calls[1][1])).toBe(12);
    compare.mockRestore();
  });
  it('rejects missing, bad, expired and wrong-algorithm tokens', async () => {
    const { user } = await account();
    const expired = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      expiresIn: -1,
    });
    const wrongAlgorithm = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      algorithm: 'HS384',
    });
    for (const token of [undefined, 'invalid', expired, wrongAlgorithm])
      expect((await call('get', '/api/notes', token)).status).toBe(401);
  });
  it('reflects changed roles and deleted accounts immediately', async () => {
    const a = await account();
    const b = await account('b@example.com');
    const note = await call('post', '/api/notes', b.token).send({
      title: 'private',
      content: 'secret',
    });
    users[0].role = 'ADMIN';
    expect(
      (await call('get', `/api/notes/${note.body.note.id}`, a.token)).status,
    ).toBe(200);
    users[0].role = 'USER';
    expect(
      (await call('get', `/api/notes/${note.body.note.id}`, a.token)).status,
    ).toBe(404);
    users.splice(0, 1);
    expect((await call('get', '/api/auth/me', a.token)).status).toBe(401);
  });
  it('limits the sixth login attempt and emits retry headers', async () => {
    const client = ++ip;
    for (let attempt = 1; attempt <= 6; attempt++) {
      const response = await call(
        'post',
        '/api/auth/login',
        undefined,
        client,
      ).send({ email: 'nobody@example.com', password: 'bad' });
      expect(response.status).toBe(attempt <= 5 ? 401 : 429);
      expect(response.headers['ratelimit-limit']).toBe('5');
      if (attempt === 6)
        expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
    }
  });
});
describe('note ownership and validation', () => {
  it('blocks all cross-user access and scopes read and write database predicates', async () => {
    const a = await account();
    const b = await account('b@example.com');
    const note = (
      await call('post', '/api/notes', b.token).send({
        title: 'B',
        content: 'B secret',
      })
    ).body.note;
    expect((await call('get', `/api/notes/${note.id}`, a.token)).status).toBe(
      404,
    );
    expect(db.note.findFirst).toHaveBeenLastCalledWith({
      where: { id: note.id, ownerId: a.user.id },
    });
    expect(
      (
        await call('patch', `/api/notes/${note.id}`, a.token).send({
          title: 'stolen',
        })
      ).status,
    ).toBe(404);
    expect(db.note.updateManyAndReturn).toHaveBeenLastCalledWith({
      where: { id: note.id, ownerId: a.user.id },
      data: { title: 'stolen' },
    });
    expect(
      (await call('delete', `/api/notes/${note.id}`, a.token)).status,
    ).toBe(404);
    expect(db.note.deleteMany).toHaveBeenLastCalledWith({
      where: { id: note.id, ownerId: a.user.id },
    });
    expect(notes[0].title).toBe('B');
    expect(
      (
        await call('patch', `/api/notes/${note.id}`, b.token).send({
          title: 'edited',
        })
      ).body.note.title,
    ).toBe('edited');
    expect(
      (await call('delete', `/api/notes/${note.id}`, b.token)).status,
    ).toBe(204);
  });
  it('lists own notes, lets admins list with owner email and modify any note', async () => {
    const a = await account();
    const b = await account('b@example.com');
    const own = (
      await call('post', '/api/notes', a.token).send({
        title: 'A',
        content: 'A',
      })
    ).body.note;
    const other = (
      await call('post', '/api/notes', b.token).send({
        title: 'B',
        content: 'B',
      })
    ).body.note;
    const list = await call('get', '/api/notes', a.token);
    expect(list.body.notes.map((n) => n.id)).toEqual([own.id]);
    users[0].role = 'ADMIN';
    const admin = await call('get', '/api/notes?page=1&limit=100', a.token);
    expect(admin.body.pagination.total).toBe(2);
    expect(admin.body.notes[1].owner.email).toBe('b@example.com');
    expect(
      (
        await call('patch', `/api/notes/${other.id}`, a.token).send({
          content: 'admin edited',
        })
      ).status,
    ).toBe(200);
    expect(
      (await call('delete', `/api/notes/${other.id}`, a.token)).status,
    ).toBe(204);
  });
  it('rejects invalid input and mass assignment with clear details', async () => {
    const a = await account();
    for (const body of [
      { title: '', content: 'x' },
      { title: 'x', content: 'x', ownerId: a.user.id },
    ]) {
      const response = await call('post', '/api/notes', a.token).send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.details.length).toBeGreaterThan(0);
    }
    for (const query of [
      'limit=101',
      'page=0',
      'page=1.5',
      'limit=1e2',
      'unknown=x',
    ])
      expect((await call('get', `/api/notes?${query}`, a.token)).status).toBe(
        400,
      );
    expect((await call('get', '/api/notes/bad-id', a.token)).status).toBe(400);
    expect(
      (
        await call('post', '/api/auth/register').send({
          email: 'new@example.com',
          password: 'weak',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call('post', '/api/auth/register').send({
          email: 'new@example.com',
          password: 'SecurePassword1',
          id: 'x',
        })
      ).status,
    ).toBe(400);
    const note = (
      await call('post', '/api/notes', a.token).send({
        title: 'x',
        content: 'x',
      })
    ).body.note;
    expect(
      (await call('patch', `/api/notes/${note.id}`, a.token).send({})).status,
    ).toBe(400);
  });
});
describe('weather and errors', () => {
  it('requires authentication and returns only sanitized weather', async () => {
    expect((await call('get', '/api/weather?city=Cairo')).status).toBe(401);
    const a = await account();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: 'Cairo',
        sys: { country: 'EG' },
        main: { temp: 30, feels_like: 31, humidity: 40 },
        weather: [{ description: 'clear' }],
        wind: { speed: 2 },
        key: process.env.OPENWEATHER_API_KEY,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await call('get', '/api/weather?city=Cairo', a.token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      city: 'Cairo',
      country: 'EG',
      temp: 30,
      feels_like: 31,
      humidity: 40,
      description: 'clear',
      wind: 2,
    });
    expect(JSON.stringify(response.body)).not.toContain(
      process.env.OPENWEATHER_API_KEY,
    );
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect((await call('get', '/api/weather?city=123', a.token)).status).toBe(
      400,
    );
  });
  it('maps upstream failures, timeouts and bad payloads without leaking secrets', async () => {
    const a = await account();
    for (const upstream of [
      { status: 404, ok: false },
      { status: 401, ok: false },
      { status: 200, ok: true, json: async () => ({}) },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(upstream));
      const response = await call('get', '/api/weather?city=Cairo', a.token);
      expect(response.status).toBe(upstream.status === 404 ? 404 : 502);
      expect(JSON.stringify(response.body)).not.toContain(
        process.env.OPENWEATHER_API_KEY,
      );
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error(process.env.OPENWEATHER_API_KEY)),
    );
    const response = await call('get', '/api/weather?city=Cairo', a.token);
    expect(response.status).toBe(502);
    expect(response.body.error.message).toBe('Weather service unavailable');
  });
  it('sanitizes unexpected errors and handles malformed JSON, body limits, CORS and health', async () => {
    expect((await call('get', '/api/health')).body).toEqual({ status: 'ok' });
    expect((await call('get', '/no-such-endpoint')).status).toBe(404);
    expect(
      (await call('get', '/api/health').set('Origin', 'https://evil.example'))
        .status,
    ).toBe(403);
    expect(
      (await call('get', '/api/health').set('Origin', 'http://localhost:3000'))
        .headers['access-control-allow-origin'],
    ).toBe('http://localhost:3000');
    expect(
      (
        await call('post', '/api/auth/register')
          .set('Content-Type', 'application/json')
          .send('{')
      ).status,
    ).toBe(400);
    expect(
      (
        await call('post', '/api/auth/register').send({
          value: 'a'.repeat(11000),
        })
      ).status,
    ).toBe(413);
    db.user.findUnique.mockRejectedValueOnce(
      new Error('sensitive database connection'),
    );
    const response = await call(
      'get',
      '/api/auth/me',
      jwt.sign({ sub: 'someone' }, process.env.JWT_SECRET, { expiresIn: '1h' }),
    );
    expect(response.status).toBe(500);
    expect(response.body.error.message).toBe('Internal server error');
  });
});
