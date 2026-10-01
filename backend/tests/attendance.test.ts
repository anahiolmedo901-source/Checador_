import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { bearer, installSupabaseMocks } from './helpers/supabase';

describe('admin attendance API', () => {
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

  it('busca asistencia vía RPC admin_attendance_search', async () => {
    const token = loginAsAdmin();
    mocks.setRpc('admin_attendance_search', async ({ p_limit, p_offset }) => ({
      data: { total: 1, rows: [{ id: mocks.newId(), check_date: '2026-09-20', status: 'on_time' }] },
      error: null,
    }));

    const res = await request(app)
      .get('/api/admin/attendance')
      .query({ from: '2026-09-01', to: '2026-09-30', limit: 10 })
      .set('Authorization', bearer(token));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.data).toHaveLength(1);
    expect(res.body.data.total).toBe(1);
    expect(mocks.calls.some((c) => c === 'rpc:admin_attendance_search')).toBe(true);
  });

  it('edita un evento de asistencia (con motivo)', async () => {
    const token = loginAsAdmin();
    mocks.setRpc('admin_edit_attendance', async () => ({
      data: { ok: true, updated: { id: 'evt-1', status: 'late' } },
      error: null,
    }));

    const res = await request(app)
      .patch(`/api/admin/attendance/events/${mocks.newId()}`)
      .set('Authorization', bearer(token))
      .send({ status: 'late', motivo: 'Retraso por tráfico' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mocks.calls.some((c) => c === 'rpc:admin_edit_attendance')).toBe(true);
  });

  it('registra incidencia para empleado', async () => {
    const token = loginAsAdmin();
    mocks.setRpc('admin_create_incident', async () => ({
      data: { ok: true, id: 'inc-1' },
      error: null,
    }));

    const res = await request(app)
      .post('/api/admin/incidents')
      .set('Authorization', bearer(token))
      .send({ employee_id: mocks.newId(), incident_type: 'late', severity: 'warning', detail: { minutes: 15 } });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('registra permiso/vacación vía RPC admin_create_off', async () => {
    const token = loginAsAdmin();
    mocks.setRpc('admin_create_off', async () => ({ data: { ok: true }, error: null }));

    const res = await request(app)
      .post('/api/admin/offtime')
      .set('Authorization', bearer(token))
      .send({ employee_id: mocks.newId(), off_type: 'permission', starts_on: '2026-10-01', ends_on: '2026-10-01', reason: 'Cita médica' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(mocks.calls.some((c) => c === 'rpc:admin_create_off')).toBe(true);
  });

  it('empleado sin permiso recibe 403', async () => {
    const emp = mocks.employee({ id: mocks.newId(), role: 'employee', code: 'EMP1' });
    mocks.seed('employees', [emp]);
    mocks.setTokenUser('tok-emp1', { id: emp.id, email: 'emp1@check.local' });

    const res = await request(app)
      .get('/api/admin/attendance')
      .set('Authorization', bearer('tok-emp1'));
    expect(res.status).toBe(403);
  });

  it('editar evento sin motivo responde 400', async () => {
    const token = loginAsAdmin();
    const res = await request(app)
      .patch(`/api/admin/attendance/events/${mocks.newId()}`)
      .set('Authorization', bearer(token))
      .send({});
    expect(res.status).toBe(400);
  });
});