import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { env } from './config/env.js';
import auth from './modules/auth/routes.js';
import notes from './modules/notes/routes.js';
import weather from './modules/weather/routes.js';
import { notFound, errorHandler } from './middleware/error.js';
import { validate } from './middleware/validate.js';
import { emptyQuery } from './modules/auth/schema.js';
import { AppError } from './utils/AppError.js';
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || env.CORS_ORIGINS.includes(origin)) callback(null, true);
      else callback(new AppError(403, 'FORBIDDEN', 'Origin not allowed'));
    },
  }),
);
app.use(express.json({ limit: '10kb' }));
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.get('/api/health', validate(emptyQuery, 'query'), (_req, res) =>
  res.json({ status: 'ok' }),
);
app.use('/api/auth', auth);
app.use('/api/notes', notes);
app.use('/api/weather', weather);
app.use(notFound);
app.use(errorHandler);
export default app;
