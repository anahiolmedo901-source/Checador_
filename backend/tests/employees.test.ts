import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { bearer, installSupabaseMocks } from './helpers/supabase';

describe('employees API', () => {
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

  it('lista empleados como admin', async () => {
    const token = loginAsAdmin();
    mocks.seed('employees', [mocks.employee({ id: mocks.newId(), code: 'E001' }), mocks.employee({ id: mocks.newId(), code: 'E002' })]);

    const res = await request(app).get('/api/employees').query({ limit: 10 }).set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.data).toHaveLength(3);
  });

  it('búsqueda por término filtra (or ilike)', async () => {
    const token = loginAsAdmin();
    mocks.seed('employees', [
      mocks.employee({ id: mocks.newId(), code: 'E001', full_name: 'María López' }),
      mocks.employee({ id: mocks.newId(), code: 'E002', full_name: 'Juan Pérez' }),
    ]);

    const res = await request(app)
      .get('/api/employees')
      .query({ search: 'Juan', limit: 10 })
      .set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.data).toHaveLength(1);
    expect(res.body.data.data[0].full_name).toBe('Juan Pérez');
  });

  it('empleado sin permiso employees.read recibe 403', async () => {
    const emp = mocks.employee({ id: mocks.newId(), role: 'employee', code: 'EMP1' });
    mocks.seed('employees', [emp]);
    mocks.setTokenUser('tok-emp1', { id: emp.id, email: 'emp1@check.local' });

    const res = await request(app)
      .get('/api/employees')
      .set('Authorization', bearer('tok-emp1'));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('crea empleado como admin (crea usuario Auth + fila)', async () => {
    const token = loginAsAdmin();

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', bearer(token))
      .send({
        code: 'NEW1',
        full_name: 'Nuevo Empleado',
        password: 'Sup3r-secreto',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.code).toBe('NEW1');
    expect(res.body.data.role).toBe('employee');
  });

  it('no permite crear con código duplicado (409)', async () => {
    const token = loginAsAdmin();
    mocks.seed('employees', [mocks.employee({ id: mocks.newId(), code: 'DUP1' })]);

    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', bearer(token))
      .send({ code: 'DUP1', full_name: 'Duplicado', password: 'Sup3r-secreto' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('actualiza empleado', async () => {
    const token = loginAsAdmin();
    const emp = mocks.employee({ id: mocks.newId(), code: 'E001' });
    mocks.seed('employees', [emp]);

    const res = await request(app)
      .patch(`/api/employees/${emp.id}`)
      .set('Authorization', bearer(token))
      .send({ phone: '55-1234-5678' });

    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('55-1234-5678');
  });

  it('desactiva empleado (soft delete)', async () => {
    const token = loginAsAdmin();
    const emp = mocks.employee({ id: mocks.newId(), code: 'E001' });
    mocks.seed('employees', [emp]);

    const res = await request(app)
      .delete(`/api/employees/${emp.id}`)
      .set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(false);
  });

  it('GET /api/employees/:id inexistente responde 404', async () => {
    const token = loginAsAdmin();
    const res = await request(app)
      .get(`/api/employees/${mocks.newId()}`)
      .set('Authorization', bearer(token));
    expect(res.status).toBe(404);
  });
});