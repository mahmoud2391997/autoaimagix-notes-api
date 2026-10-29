import { z } from 'zod';
export const password = z
  .string()
  .min(8)
  .max(72)
  .refine(
    (v) => Buffer.byteLength(v, 'utf8') <= 72,
    'Password must be at most 72 UTF-8 bytes',
  )
  .regex(/[a-z]/, 'Include a lowercase letter')
  .regex(/[A-Z]/, 'Include an uppercase letter')
  .regex(/[0-9]/, 'Include a number');
const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase());
// Role is the explicit compatibility exception: accept, discard, never persist it.
export const registerSchema = z
  .object({ email, password, role: z.unknown().optional() })
  .strict()
  .transform(({ email, password }) => ({ email, password }));
export const loginSchema = z
  .object({
    email,
    password: z
      .string()
      .min(1)
      .max(72)
      .refine(
        (v) => Buffer.byteLength(v, 'utf8') <= 72,
        'Password must be at most 72 UTF-8 bytes',
      ),
  })
  .strict();
export const emptyQuery = z.object({}).strict();
