import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const { use } = vi.hoisted(() => ({ use: vi.fn() }));
vi.mock('@upstash/redis', () => ({
  Redis: class {
    use(...args) {
      return use(...args);
    }
  },
}));
import { createRateLimitRedis } from '../src/lib/rateLimitRedis.js';
beforeEach(() => use.mockReset());
const config = { url: 'http://127.0.0.1:8079', token: 'test-only' };
it('leaves production Redis scripts unchanged', () => {
  createRateLimitRedis({ ...config, url: 'https://redis.example.com' });
  expect(use).not.toHaveBeenCalled();
});
it('strips the local-only unsupported Lua flag and maps subsequent script hashes', async () => {
  createRateLimitRedis({ ...config, localCompatibility: true });
  const adapt = use.mock.calls[0][0];
  const script = '#!lua flags=allow-key-locking\nreturn 1';
  const hash = (value) => createHash('sha1').update(value).digest('hex');
  const next = vi.fn(async (request) => request);
  const evalRequest = await adapt(
    { body: ['eval', script, 1, 'key'], headers: { test: 'preserved' } },
    next,
  );
  expect(evalRequest).toEqual({
    body: ['eval', 'return 1', 1, 'key'],
    headers: { test: 'preserved' },
  });
  const cachedRequest = await adapt(
    { body: ['evalsha', hash(script), 1, 'key'] },
    next,
  );
  expect(cachedRequest.body).toEqual(['evalsha', hash('return 1'), 1, 'key']);
});
it('supports pipelines and preserves ordinary commands', async () => {
  createRateLimitRedis({ ...config, localCompatibility: true });
  const adapt = use.mock.calls[0][0];
  const response = await adapt(
    {
      body: [['ping'], ['eval', '#!lua flags=allow-key-locking\nreturn 2', 0]],
    },
    async (r) => r,
  );
  expect(response.body).toEqual([['ping'], ['eval', 'return 2', 0]]);
});
