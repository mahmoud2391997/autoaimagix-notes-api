import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../utils/AppError.js';
import { getWeather } from './controller.js';
const router = Router();
const query = z
  .object({
    city: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .regex(/^[\p{L} -]+$/u, 'Use letters, spaces, or hyphens')
      .refine((v) => /\p{L}/u.test(v), 'Include at least one letter'),
  })
  .strict();
router.get(
  '/',
  authenticate,
  validate(query, 'query'),
  asyncHandler(getWeather),
);
export default router;
