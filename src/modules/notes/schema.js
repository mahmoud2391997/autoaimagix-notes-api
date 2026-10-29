import { z } from 'zod';
const fields = {
  title: z.string().trim().min(1).max(200),
  content: z.string().min(1).max(8000),
};
export const createSchema = z.object(fields).strict();
export const updateSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');
export const idSchema = z.object({ id: z.string().cuid() }).strict();
const positiveInteger = (max) =>
  z
    .string()
    .regex(/^[1-9]\d*$/, 'Expected a positive integer')
    .transform(Number)
    .pipe(z.number().int().max(max));
export const listSchema = z
  .object({
    page: positiveInteger(1000000).default(1),
    limit: positiveInteger(100).default(20),
  })
  .strict();
