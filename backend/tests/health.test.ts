import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { installSupabaseMocks } from './helpers/supabase';

describe('health endpoints', () => {
  let app: Express;
  let mocks: ReturnType<typeof installSupabaseMocks>;

  beforeAll(() => {
    mocks = installSupabaseMocks();
    app = createApp();
  });
  beforeEach(() => mocks.reset());
  afterAll(() => mocks.restore());

  it('GET /api/health responde ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.db).toBe('ok');
    expect(res.body.data.version).toBe('test');
    expect(typeof res.body.data.uptime).toBe('number');
  });

  it('GET /api/health/detailed expone métricas de monitoreo sin secrets', async () => {
    const res = await request(app).get('/api/health/detailed');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.status).toBe('ok');
    expect(d.version).toBe('test');
    expect(d.nodeEnv).toBe('test');
    expect(typeof d.memoryRssMb).toBe('number');
    expect(typeof d.dbMs).toBe('number');
    expect(d.db).toBe('ok');
    expect(new Date(d.timestamp).toString()).not.toBe('Invalid Date');
    expect(JSON.stringify(res.body)).not.toContain('SECRET');
  });
});