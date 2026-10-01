import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import path from 'path';

import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { globalRateLimit } from './middleware/rate-limit';
import apiRoutes from './routes';
import { logger, httpLogger } from './utils/logger';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      // En desarrollo se refleja cualquier origen (expo, vite). En producción
      // SOLO se permite la lista explícita de CORS_ORIGINS; si está vacía no se
      // emite Access-Control-Allow-Origin, así el navegador bloquea orígenes
      // cruzados y solo funcionan clientes nativos / mismo origen.
      origin: env.isProd ? env.corsOrigins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(httpLogger);
  app.use(globalRateLimit);

  app.use('/api', apiRoutes);

  // Vista web de Smart Display (compatible navegador / WebView).
  // Override de la CSP por defecto de helmet: esta página usa estilos/scripts
  // inline y reproduce media firmada (https) o por blob.
  app.use('/pantalla', (_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' blob: data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' ws: wss: https:"
    );
    next();
  });
  app.get('/pantalla', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pantalla.html'));
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  if (env.isProd && env.corsOrigins.length === 0) {
    logger.warn('Producción sin CORS_ORIGINS: se bloquearán peticiones de navegadores cross-origin.');
  }

  return app;
}