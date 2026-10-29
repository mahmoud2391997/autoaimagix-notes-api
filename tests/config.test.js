import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});
it('fails startup for weak secrets without echoing their values', async () => {
  vi.resetModules();
  vi.stubEnv('JWT_SECRET', 'short');
  await expect(import('../src/config/env.js')).rejects.toThrow('JWT_SECRET');
});
it('requires shared rate limiting in production', async () => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  await expect(import('../src/config/env.js')).rejects.toThrow(
    'Production requires a shared Upstash',
  );
});
it('rejects partial Redis configuration', async () => {
  vi.resetModules();
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com');
  await expect(import('../src/config/env.js')).rejects.toThrow(
    'Both Upstash variables',
  );
});

it('accepts Vercel Marketplace Redis aliases in production', async () => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('KV_REST_API_URL', 'https://redis.example.com');
  vi.stubEnv('KV_REST_API_TOKEN', 'test-integration-token');
  const { env } = await import('../src/config/env.js');
  expect(env.UPSTASH_REDIS_REST_URL).toBe('https://redis.example.com');
  expect(env.UPSTASH_REDIS_REST_TOKEN).toBe('test-integration-token');
});
