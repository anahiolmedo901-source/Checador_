import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { bearer, installSupabaseMocks } from './helpers/supabase';

describe('display (Smart Display)', () => {
  let app: Express;
  let mocks: ReturnType<typeof installSupabaseMocks>;

  beforeAll(() => {
    mocks = installSupabaseMocks();
    app = createApp();
  });
  beforeEach(() => mocks.reset());
  afterAll(() => mocks.restore());

  it('registro válido devuelve display + wsUrl + snapshot', async () => {
    mocks.setRpc('display_authenticate', async () => ({
      data: { ok: true, display: { id: 'disp-1', name: 'TV Lobby', code: 'ABC123', branch_id: 'br-1' } },
      error: null,
    }));
    mocks.setRpc('display_snapshot', async () => ({
      data: { branch_id: 'br-1', playlist: [], announcements: [], attendance: [] },
      error: null,
    }));

    const res = await request(app)
      .post('/api/displays/register')
      .send({ code: 'ABC123', token: 'tok-display' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.display.id).toBe('disp-1');
    expect(res.body.wsUrl).toMatch(/\/api\/displays\/ws$/);
    expect(res.body.snapshot.branch_id).toBe('br-1');
  });

  it('token revocado responde 401', async () => {
    mocks.setRpc('display_authenticate', async () => ({
      data: { ok: false, reason: 'token_revoked', display: null },
      error: null,
    }));

    const res = await request(app)
      .post('/api/displays/register')
      .send({ code: 'ABC123', token: 'revocado' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DISPLAY_TOKEN_REVOKED');
  });

  it('pantalla sin sucursal responde 400', async () => {
    mocks.setRpc('display_authenticate', async () => ({
      data: { ok: true, display: { id: 'disp-2', name: 'TV', code: 'ABC123', branch_id: null } },
      error: null,
    }));

    const res = await request(app)
      .post('/api/displays/register')
      .send({ code: 'ABC123', token: 'tok-display' });

    expect(res.status).toBe(400);
  });

  it('snapshot con credenciales por headers firma URLs de media', async () => {
    mocks.setRpc('display_authenticate', async () => ({
      data: { ok: true, display: { id: 'disp-1', name: 'TV', code: 'ABC123', branch_id: 'br-1' } },
      error: null,
    }));
    mocks.setRpc('display_snapshot', async () => ({
      data: {
        branch_id: 'br-1',
        playlist: [
          {
            item_type: 'media',
            media: { file_path: 'playlist/video.mp4', signed_url: null },
          },
        ],
        announcements: [],
        attendance: [],
      },
      error: null,
    }));

    const res = await request(app)
      .get('/api/displays/snapshot')
      .set('x-display-code', 'ABC123')
      .set('Authorization', bearer('tok-display'));

    expect(res.status).toBe(200);
    const item = res.body.snapshot.playlist[0];
    expect(item.media.signed_url).toMatch(/^https:\/\/signed\/media\/playlist\/video\.mp4/);
    expect(item.media.kind).toBe('image');
  });

  it('snapshot sin credenciales responde 401', async () => {
    const res = await request(app).get('/api/displays/snapshot');
    expect(res.status).toBe(401);
  });
});