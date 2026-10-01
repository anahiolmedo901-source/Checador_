import 'dotenv/config';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno: ${name}`);
  }
  return value;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),

  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),

  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX ?? 120),
  loginRateLimitMax: Number(process.env.LOGIN_RATE_LIMIT_MAX ?? 10),

  signedUrlExpiresS: Number(process.env.SIGNED_URL_EXPIRES_S ?? 300),

  /** Heartbeat (ms) del WebSocket de Smart Displays (ping + reenvío). */
  displayWsHeartbeatMs: Number(process.env.DISPLAY_WS_HEARTBEAT_MS ?? 30_000),

  /** URL pública del backend (para emitir wsUrl). Si falta, se deriva del request. */
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',

  isProd: (process.env.NODE_ENV ?? 'development') === 'production',
};