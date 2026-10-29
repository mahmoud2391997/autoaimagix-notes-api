import * as service from './service.js';
/** Register a validated user. */
export const register = async (req, res) =>
  res.status(201).json(await service.register(req.body));
/** Log in a validated user. */
export const login = async (req, res) =>
  res.json(await service.login(req.body));
/** Return the authenticated public identity. */
export const me = (req, res) => res.json({ user: req.user });
