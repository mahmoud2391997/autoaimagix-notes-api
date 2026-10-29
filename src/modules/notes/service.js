import prisma from '../../lib/prisma.js';
import { AppError } from '../../utils/AppError.js';
const scope = (user) => (user.role === 'ADMIN' ? {} : { ownerId: user.id });
const missing = () => new AppError(404, 'NOT_FOUND', 'Note not found');
/** Create a note owned exclusively by the authenticated user. */
export const create = (user, data) =>
  prisma.note.create({
    data: { title: data.title, content: data.content, ownerId: user.id },
  });
/** List only authorized notes with bounded pagination. */
export async function list(user, { page, limit }) {
  const where = scope(user);
  const [notes, total] = await prisma.$transaction([
    prisma.note.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(user.role === 'ADMIN'
        ? { include: { owner: { select: { email: true } } } }
        : {}),
    }),
    prisma.note.count({ where }),
  ]);
  return { notes, pagination: { page, limit, total } };
}
/** Read by id and ownership together to prevent existence disclosure. */
export async function read(user, id) {
  const note = await prisma.note.findFirst({ where: { id, ...scope(user) } });
  if (!note) throw missing();
  return note;
}
/** Update atomically with the authorization predicate in the write itself. */
export async function update(user, id, data) {
  const notes = await prisma.note.updateManyAndReturn({
    where: { id, ...scope(user) },
    data,
  });
  if (!notes.length) throw missing();
  return notes[0];
}
/** Delete atomically with ownership filtering. */
export async function remove(user, id) {
  const { count } = await prisma.note.deleteMany({
    where: { id, ...scope(user) },
  });
  if (!count) throw missing();
}
