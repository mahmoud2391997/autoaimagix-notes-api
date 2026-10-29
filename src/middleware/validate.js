import { AppError } from '../utils/AppError.js';
/** Parse a request section and replace it with validated, normalized data. */
export const validate =
  (schema, target = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success)
      return next(
        new AppError(
          400,
          'VALIDATION_ERROR',
          'Invalid request input',
          result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        ),
      );
    req[target] = result.data;
    next();
  };
