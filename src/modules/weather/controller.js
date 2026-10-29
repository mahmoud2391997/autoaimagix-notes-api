import { weather } from './service.js';
/** Return sanitized metric weather for a validated city. */
export const getWeather = async (req, res) =>
  res.json(await weather(req.query.city));
