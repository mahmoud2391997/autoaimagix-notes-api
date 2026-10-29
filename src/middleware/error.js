import { AppError } from '../utils/AppError.js';
/** Return a consistent 404 for unknown endpoints. */
export const notFound = (_req, _res, next) =>
  next(new AppError(404, 'NOT_FOUND', 'Endpoint not found'));
/** Serialize only approved errors; never expose internal messages or stacks. */
export function errorHandler(err, _req, res, _next) {
  if (res.headersSent) return _next(err);
  if (err.type === 'entity.parse.failed')
    err = new AppError(400, 'VALIDATION_ERROR', 'Malformed JSON', [
      { path: 'body', message: 'Expected valid JSON' },
    ]);
  if (err.type === 'entity.too.large')
    err = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 10kb');
  if (err.code === 'P2002')
    err = new AppError(409, 'CONFLICT', 'Email already registered');
  const known = err instanceof AppError;
  res.status(known ? err.status : 500).json({
    error: {
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known ? err.message : 'Internal server error',
      details: known ? err.details : [],
    },
  });
}
