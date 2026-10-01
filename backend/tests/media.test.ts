import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { bearer, installSupabaseMocks } from './helpers/supabase';

describe('media API (admin)', () => {
  let app: Express;
  let mocks: ReturnType<typeof installSupabaseMocks>;

  beforeAll(() => {
    mocks = installSupabaseMocks();
    app = createApp();
  });
  beforeEach(() => mocks.reset());
  afterAll(() => mocks.restore());

  function loginAsAdmin() {
    const admin = mocks.employee({ id: mocks.newId(), role: 'admin', code: 'ADM1' });
    mocks.seed('employees', [admin]);
    mocks.setTokenUser('tok-admin', { id: admin.id, email: 'admin@check.local' });
    return 'tok-admin';
  }

  it('lista multimedia como admin', async () => {
    const token = loginAsAdmin();
    mocks.seed('media', [
      { id: mocks.newId(), kind: 'image', title: 'Logo', file_path: 'logo.png', active: true, created_at: new Date().toISOString() },
      { id: mocks.newId(), kind: 'video', title: 'Spot', file_path: 'spot.mp4', active: true, created_at: new Date().toISOString() },
    ]);

    const res = await request(app).get('/api/admin/media').query({ limit: 10 }).set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.data).toHaveLength(2);
  });

  it('crea media por URL', async () => {
    const token = loginAsAdmin();

    const res = await request(app)
      .post('/api/admin/media')
      .set('Authorization', bearer(token))
      .send({ kind: 'url', title: 'Capacitación', url: 'https://cdn.example.com/training.mp4', mime_type: 'video/mp4' });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Capacitación');
    expect(res.body.data.kind).toBe('url');
  });

  it('sube archivo a storage + crea media', async () => {
    const token = loginAsAdmin();

    const res = await request(app)
      .post('/api/admin/media/upload')
      .set('Authorization', bearer(token))
      .field('title', 'Foto de bienvenida')
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
        filename: 'bienvenida.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Foto de bienvenida');
    expect(mocks.calls.some((c) => c.startsWith('rpc:admin_write_audit'))).toBe(true);
  });

  it('sube archivo con tipo no permitido responde 400', async () => {
    const token = loginAsAdmin();

    const res = await request(app)
      .post('/api/admin/media/upload')
      .set('Authorization', bearer(token))
      .field('title', 'Malicioso')
      .attach('file', Buffer.from('nodejs'), {
        filename: 'script.exe',
        contentType: 'application/x-msdownload',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_UPLOAD');
  });

  it('empleado sin permiso recibe 403', async () => {
    const emp = mocks.employee({ id: mocks.newId(), role: 'employee', code: 'EMP1' });
    mocks.seed('employees', [emp]);
    mocks.setTokenUser('tok-emp1', { id: emp.id, email: 'emp1@check.local' });

    const res = await request(app)
      .get('/api/admin/media')
      .set('Authorization', bearer('tok-emp1'));
    expect(res.status).toBe(403);
  });
});