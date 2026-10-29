import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import prisma from '../lib/prisma.js';
import { publicUser } from '../modules/auth/service.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
/** Verify a signed token and reload current identity and role from storage. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization ?? '');
  if (!match)
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  let payload;
  try {
    payload = jwt.verify(match[1], env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number')
      throw new Error('Invalid claims');
  } catch {
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: publicUser,
  });
  if (!user)
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired token');
  req.user = user;
  next();
});
/** Restrict a route using the freshly loaded database role. */
export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user)
      return next(
        new AppError(401, 'UNAUTHENTICATED', 'Authentication required'),
      );
    if (!roles.includes(req.user.role))
      return next(new AppError(403, 'FORBIDDEN', 'Insufficient permissions'));
    next();
  };
