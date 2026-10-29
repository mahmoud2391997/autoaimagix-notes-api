import 'dotenv/config';
import { z } from 'zod';
const optional = (schema) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const schema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((v) => /^postgres(ql)?:/.test(v)),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.literal('1h').default('1h'),
    OPENWEATHER_API_KEY: z.string().trim().min(1),
    CORS_ORIGINS: z
      .string()
      .min(1)
      .transform((s) => s.split(',').map((v) => v.trim()))
      .pipe(
        z
          .array(
            z
              .string()
              .url()
              .refine((v) => {
                const u = new URL(v);
                return (
                  ['http:', 'https:'].includes(u.protocol) && u.origin === v
                );
              }),
          )
          .min(1),
      ),
    UPSTASH_REDIS_REST_URL: optional(z.string().url()),
    UPSTASH_REDIS_REST_TOKEN: optional(z.string().min(1)),
    ADMIN_EMAIL: optional(
      z
        .string()
        .email()
        .transform((v) => v.toLowerCase()),
    ),
    ADMIN_PASSWORD: optional(
      z.string().min(8).max(72).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
    ),
  })
  .superRefine((v, ctx) => {
    if (v.UPSTASH_REDIS_REST_URL) {
      const url = new URL(v.UPSTASH_REDIS_REST_URL);
      const localHttp =
        v.NODE_ENV !== 'production' &&
        url.protocol === 'http:' &&
        ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !localHttp)
        ctx.addIssue({
          code: 'custom',
          path: ['UPSTASH_REDIS_REST_URL'],
          message:
            'Redis REST requires HTTPS, except loopback HTTP outside production',
        });
    }

    if (
      Boolean(v.UPSTASH_REDIS_REST_URL) !== Boolean(v.UPSTASH_REDIS_REST_TOKEN)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['UPSTASH_REDIS_REST_URL'],
        message: 'Both Upstash variables are required together',
      });
    if (v.NODE_ENV === 'production' && !v.UPSTASH_REDIS_REST_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['UPSTASH_REDIS_REST_URL'],
        message: 'Production requires a shared Upstash rate-limit store',
      });
  });
const result = schema.safeParse({
  ...process.env,
  UPSTASH_REDIS_REST_URL:
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  UPSTASH_REDIS_REST_TOKEN:
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});
if (!result.success)
  throw new Error(
    `Invalid environment: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
  );
export const env = result.data;
