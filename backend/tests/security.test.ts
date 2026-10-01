import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { installSupabaseMocks } from './helpers/supabase';

describe('seguridad', () => {
  let app: Express;
  let mocks: ReturnType<typeof installSupabaseMocks>;

  beforeAll(() => {
    mocks = installSupabaseMocks();
    app = createApp();
  });
  beforeEach(() => mocks.reset());
  afterAll(() => mocks.restore());

  it('login con fuerza bruta es limitado (429)', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'x@check.local', password: 'intento-invalido' });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('respeta el header Origin (CORS en dev refleja orígenes)', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://admin.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://admin.example.com');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('inyecta headers de seguridad de helmet', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
  });

  it('ruta inexistente responde 404 JSON', async () => {
    const res = await request(app).get('/api/no-existe');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('no expone datos del stack en errores 500', async () => {
    mocks.setRpc('admin_attendance_search', async () => {
      throw new Error('SECRET_DB_INTERNA');
    });
    const admin = mocks.employee({ id: mocks.newId(), role: 'admin', code: 'ADM1' });
    mocks.seed('employees', [admin]);
    mocks.setTokenUser('tok-admin', { id: admin.id, email: 'admin@check.local' });

    const res = await request(app)
      .get('/api/admin/attendance')
      .set('Authorization', 'Bearer tok-admin');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('SECRET_DB_INTERNA');
  });
});