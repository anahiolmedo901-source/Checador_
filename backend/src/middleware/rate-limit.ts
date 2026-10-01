import rateLimit from 'express-rate-limit';

import { env } from '../config/env';

export function jsonLimiter(windowMs: number, limit: number): ReturnType<typeof rateLimit> {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Demasiadas solicitudes. Intenta más tarde.' },
    },
  });
}

/** Límite global por IP. */
export const globalRateLimit = jsonLimiter(env.rateLimitWindowMs, env.rateLimitMax);

/** Límite estricto para /api/auth/login (fuerza bruta). */
export const loginRateLimit = jsonLimiter(env.rateLimitWindowMs, env.loginRateLimitMax);