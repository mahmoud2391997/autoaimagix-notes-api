import { Router } from 'express';
import * as controller from './controller.js';
import { registerSchema, loginSchema, emptyQuery } from './schema.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { loginLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../utils/AppError.js';
const router = Router();
router.post(
  '/register',
  validate(emptyQuery, 'query'),
  validate(registerSchema),
  asyncHandler(controller.register),
);
router.post(
  '/login',
  loginLimiter,
  validate(emptyQuery, 'query'),
  validate(loginSchema),
  asyncHandler(controller.login),
);
router.get('/me', authenticate, validate(emptyQuery, 'query'), controller.me);
export default router;
