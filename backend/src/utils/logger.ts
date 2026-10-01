import { pino } from 'pino';
import pinoHttp from 'pino-http';

import { env } from '../config/env';

const name = 'checador-api';

export const logger = pino({
  name,
  level: env.isProd ? 'info' : 'debug',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.password_confirmation',
    ],
    censor: '[REDACTED]',
  },
  transport: env.isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
});

export const httpLogger = pinoHttp({
  logger,
  customProps: () => ({ footprint: name }),
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
      };
    },
  },
  quietReqLogger: true,
});