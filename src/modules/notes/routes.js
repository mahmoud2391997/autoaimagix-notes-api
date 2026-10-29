import { Router } from 'express';
import * as controller from './controller.js';
import { createSchema, updateSchema, idSchema, listSchema } from './schema.js';
import { emptyQuery } from '../auth/schema.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../utils/AppError.js';
const router = Router();
router.use(authenticate);
router.post(
  '/',
  validate(emptyQuery, 'query'),
  validate(createSchema),
  asyncHandler(controller.create),
);
router.get('/', validate(listSchema, 'query'), asyncHandler(controller.list));
router.get(
  '/:id',
  validate(emptyQuery, 'query'),
  validate(idSchema, 'params'),
  asyncHandler(controller.read),
);
router.patch(
  '/:id',
  validate(emptyQuery, 'query'),
  validate(idSchema, 'params'),
  validate(updateSchema),
  asyncHandler(controller.update),
);
router.delete(
  '/:id',
  validate(emptyQuery, 'query'),
  validate(idSchema, 'params'),
  asyncHandler(controller.remove),
);
export default router;
