import * as service from './service.js';
/** Create the caller's note. */
export const create = async (req, res) =>
  res.status(201).json({ note: await service.create(req.user, req.body) });
/** List visible notes. */
export const list = async (req, res) =>
  res.json(await service.list(req.user, req.query));
/** Read a visible note. */
export const read = async (req, res) =>
  res.json({ note: await service.read(req.user, req.params.id) });
/** Update a visible note. */
export const update = async (req, res) =>
  res.json({ note: await service.update(req.user, req.params.id, req.body) });
/** Delete a visible note. */
export const remove = async (req, res) => {
  await service.remove(req.user, req.params.id);
  res.status(204).end();
};
