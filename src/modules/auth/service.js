import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
export const publicUser = {
  id: true,
  email: true,
  role: true,
  createdAt: true,
};
const dummyHash = bcrypt.hashSync('Timing-only-dummy-password1', 12);
const tokenFor = (user) =>
  jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });
/** Register an unprivileged account and return its public identity and JWT. */
export async function register({ email, password }) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash, role: 'USER' },
    select: publicUser,
  });
  return { user, token: tokenFor(user) };
}
/** Authenticate with identical error and bcrypt work for unknown accounts. */
export async function login({ email, password }) {
  const record = await prisma.user.findUnique({
    where: { email },
    select: { ...publicUser, passwordHash: true },
  });
  const valid = await bcrypt.compare(
    password,
    record?.passwordHash ?? dummyHash,
  );
  if (!record || !valid)
    throw new AppError(401, 'UNAUTHENTICATED', 'Invalid credentials');
  const user = Object.fromEntries(
    Object.keys(publicUser).map((key) => [key, record[key]]),
  );
  return { user, token: tokenFor(user) };
}
