import { rateLimit } from 'express-rate-limit';
import { Ratelimit } from '@upstash/ratelimit';
import { createRateLimitRedis } from '../lib/rateLimitRedis.js';
import { env } from '../config/env.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
const shared = env.UPSTASH_REDIS_REST_URL
  ? new Ratelimit({
      redis: createRateLimitRedis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
        localCompatibility:
          env.NODE_ENV !== 'production' &&
          new URL(env.UPSTASH_REDIS_REST_URL).protocol === 'http:',
      }),
      limiter: Ratelimit.fixedWindow(5, '15 m'),
      prefix: 'notes:login',
      analytics: false,
      timeout: 5000,
    })
  : null;
const limited = () =>
  new AppError(
    429,
    'RATE_LIMITED',
    'Too many login attempts. Try again later.',
  );
/** Limit all login attempts by proxy-derived IP, with shared production state. */
export const loginLimiter = shared
  ? asyncHandler(async (req, res, next) => {
      let result;
      try {
        result = await shared.limit(req.ip);
      } catch {
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Login temporarily unavailable',
        );
      }
      // Upstash's timeout is permissive by default: explicitly fail closed.
      if (result.reason === 'timeout')
        throw new AppError(
          503,
          'SERVICE_UNAVAILABLE',
          'Login temporarily unavailable',
        );
      const seconds = Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000),
      );
      res.set({
        'RateLimit-Limit': String(result.limit),
        'RateLimit-Remaining': String(result.remaining),
        'RateLimit-Reset': String(seconds),
        'RateLimit-Policy': '5;w=900',
      });
      if (!result.success) {
        res.set('Retry-After', String(seconds));
        throw limited();
      }
      next();
    })
  : rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 5,
      standardHeaders: 'draft-6',
      legacyHeaders: false,
      handler: (_req, _res, next) => next(limited()),
    });
