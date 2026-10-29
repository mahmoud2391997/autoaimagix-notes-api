import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock('@upstash/redis', () => ({ Redis: class {} }));
vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static fixedWindow() {
      return {};
    }
    limit(...args) {
      return limit(...args);
    }
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  limit.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
const invoke = async () => {
  const { loginLimiter } = await import('../src/middleware/rateLimit.js');
  const res = { set: vi.fn() };
  const next = vi.fn();
  await loginLimiter({ ip: '192.0.2.1' }, res, next);
  return { res, next };
};
it('sets distributed headers and Retry-After when denied', async () => {
  limit.mockResolvedValue({
    success: false,
    limit: 5,
    remaining: 0,
    reset: Date.now() + 60000,
  });
  const { res, next } = await invoke();
  expect(limit).toHaveBeenCalledWith('192.0.2.1');
  expect(res.set).toHaveBeenCalledWith('Retry-After', expect.any(String));
  expect(next.mock.calls[0][0]).toMatchObject({ status: 429 });
});
it('fails closed when Upstash reports a permissive timeout', async () => {
  limit.mockResolvedValue({ success: true, reason: 'timeout' });
  const { next } = await invoke();
  expect(next.mock.calls[0][0]).toMatchObject({ status: 503 });
});
it('fails closed when Redis rejects', async () => {
  limit.mockRejectedValue(new Error('private redis details'));
  const { next } = await invoke();
  expect(next.mock.calls[0][0]).toMatchObject({
    status: 503,
    message: 'Login temporarily unavailable',
  });
});
it('allows requests within the distributed limit', async () => {
  limit.mockResolvedValue({
    success: true,
    limit: 5,
    remaining: 4,
    reset: Date.now() + 60000,
  });
  const { next } = await invoke();
  expect(next).toHaveBeenCalledWith();
});
