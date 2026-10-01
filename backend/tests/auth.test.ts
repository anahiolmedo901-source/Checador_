import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { bearer, installSupabaseMocks } from './helpers/supabase';

describe('auth', () => {
  let app: Express;
  let mocks: ReturnType<typeof installSupabaseMocks>;

  beforeAll(() => {
    mocks = installSupabaseMocks();
    app = createApp();
  });
  beforeEach(() => mocks.reset());
  afterAll(() => mocks.restore());

  it('login válido devuelve token + perfil', async () => {
    const admin = mocks.employee({ id: mocks.newId(), role: 'admin', code: 'ADM1' });
    mocks.seed('employees', [admin]);
    mocks.setLoginUser({ id: admin.id, email: 'admin@check.local' }, 'tok-admin');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@check.local', password: 'Sup3r-secreto' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.access_token).toBe('tok-admin');
    expect(res.body.data.user.id).toBe(admin.id);
    expect(res.body.data.employee.role).toBe('admin');
  });

  it('login con credenciales inválidas responde 401', async () => {
    mocks.setSignInError('Invalid login credentials');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nadie@check.local', password: 'wrongpass1' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('usuario Auth sin perfil de empleado responde 403', async () => {
    mocks.setLoginUser({ id: mocks.newId(), email: 'ghost@check.local' }, 'tok-ghost');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@check.local', password: 'Sup3r-secreto' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('login con empleado inactivo responde 403', async () => {
    const emp = mocks.employee({ id: mocks.newId(), role: 'employee', active: false });
    mocks.seed('employees', [emp]);
    mocks.setLoginUser({ id: emp.id, email: 'e1@check.local' }, 'tok-e1');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'e1@check.local', password: 'Sup3r-secreto' });

    expect(res.status).toBe(403);
  });

  it('login con body inválido responde 400 (validación)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'no-es-un-email', password: '' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('/me sin token responde 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('/me con token válido devuelve el perfil', async () => {
    const emp = mocks.employee({ id: mocks.newId(), role: 'employee', code: 'EMP1' });
    mocks.seed('employees', [emp]);
    mocks.setTokenUser('tok-emp1', { id: emp.id, email: 'emp1@check.local' });

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer('tok-emp1'));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(emp.id);
    expect(res.body.data.role).toBe('employee');
  });

  it('/me con empleado inactivo responde 403', async () => {
    const emp = mocks.employee({ id: mocks.newId(), role: 'employee', active: false });
    mocks.seed('employees', [emp]);
    mocks.setTokenUser('tok-off', { id: emp.id, email: 'off@check.local' });

    const res = await request(app).get('/api/auth/me').set('Authorization', bearer('tok-off'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});