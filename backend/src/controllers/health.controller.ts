import { Request, Response } from 'express';

import { env } from '../config/env';
import { supabaseAdmin } from '../config/supabase';
import { logger } from '../utils/logger';

const APP_VERSION = process.env.APP_VERSION ?? 'dev';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  version: string;
}

async function checkDb(): Promise<boolean> {
  const { error } = await supabaseAdmin.from('departments').select('id').limit(1);
  return !error;
}

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  let dbOk = true;
  try {
    dbOk = await checkDb();
  } catch (err) {
    logger.warn({ err }, 'Health: la base de datos no responde');
    dbOk = false;
  }

  const body: HealthResponse = {
    status: dbOk ? 'ok' : 'degraded',
    db: dbOk ? 'ok' : 'error',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
  };
  res.status(dbOk ? 200 : 503).json({ success: true, data: body });
}

/** Diagnóstico para monitoreo (métricas no sensibles; sin secrets). */
export async function healthDetailed(_req: Request, res: Response): Promise<void> {
  const started = Date.now();
  let dbOk = true;
  try {
    dbOk = await checkDb();
  } catch {
    dbOk = false;
  }
  const dbMs = Date.now() - started;

  res.status(dbOk ? 200 : 503).json({
    success: true,
    data: {
      status: dbOk ? 'ok' : 'degraded',
      version: APP_VERSION,
      nodeEnv: env.nodeEnv,
      uptime: Math.round(process.uptime()),
      memoryRssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      db: dbOk ? 'ok' : 'error',
      dbMs,
      timestamp: new Date().toISOString(),
    },
  });
}