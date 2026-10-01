import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { bearer, installSupabaseMocks } from './helpers/supabase';

describe('schedules API', () => {
  let app: Express;
  let mocks: ReturnType<typeof installSupabaseMocks>;

  beforeAll(() => {
    mocks = installSupabaseMocks();
    app = createApp();
  });
  beforeEach(() => mocks.reset());
  afterAll(() => mocks.restore());

  function authAs(role: 'admin' | 'hr' | 'employee') {
    const emp = mocks.employee({ id: mocks.newId(), role, code: role.toUpperCase() + '1' });
    mocks.seed('employees', [emp]);
    const token = `tok-${role}`;
    mocks.setTokenUser(token, { id: emp.id, email: `${role}@check.local` });
    return token;
  }

  it('lista horarios como admin', async () => {
    const token = authAs('admin');
    mocks.seed('schedules', [
      { id: mocks.newId(), name: 'Matutino', code: 'M1', check_in: '08:00', check_out: '17:00', tolerance_min: 5, break_min: 60, active: true, effective_from: '2020-01-01', effective_to: null },
      { id: mocks.newId(), name: 'Vespertino', code: 'V1', check_in: '14:00', check_out: '23:00', tolerance_min: 5, break_min: 60, active: true, effective_from: '2020-01-01', effective_to: null },
    ]);

    const res = await request(app).get('/api/schedules').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
  });

  it('crea horario como hr', async () => {
    const token = authAs('hr');

    const res = await request(app)
      .post('/api/schedules')
      .set('Authorization', bearer(token))
      .send({ name: 'Nocturno', code: 'N1', check_in: '22:00', check_out: '06:00', tolerance_min: 10, break_min: 30 });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('N1');
  });

  it('actualiza horario', async () => {
    const token = authAs('admin');
    const row = { id: mocks.newId(), name: 'Matutino', code: 'M1', check_in: '08:00', check_out: '17:00', tolerance_min: 5, break_min: 60, active: true, effective_from: '2020-01-01', effective_to: null };
    mocks.seed('schedules', [row]);

    const res = await request(app)
      .patch(`/api/schedules/${row.id}`)
      .set('Authorization', bearer(token))
      .send({ tolerance_min: 15 });

    expect(res.status).toBe(200);
    expect(res.body.data.tolerance_min).toBe(15);
  });

  it('empleado sin permiso recibe 403', async () => {
    const token = authAs('employee');
    const res = await request(app).get('/api/schedules').set('Authorization', bearer(token));
    expect(res.status).toBe(403);
  });

  it('body inválido responde 400', async () => {
    const token = authAs('admin');
    const res = await request(app)
      .post('/api/schedules')
      .set('Authorization', bearer(token))
      .send({ name: 'Sin hora' });
    expect(res.status).toBe(400);
  });
});