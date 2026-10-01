import { Request, Response } from 'express';
import { createHash } from 'node:crypto';

import { displayService } from '../services/display.service';
import { env } from '../config/env';
import { HTTPError } from '../utils/http-error';
import { asyncHandler } from '../utils/async-handler';
import { RegisterDisplayResult } from '../types';

/** POST /api/displays/pair — exchange a one-time admin code for display credentials. */
export const pair = asyncHandler(async (req: Request, res: Response) => {
  const { pairing_code, software, os_version } = req.body as {
    pairing_code?: string;
    software?: string;
    os_version?: string;
  };
  const normalized = String(pairing_code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{8}$/.test(normalized)) throw HTTPError.badRequest('Ingresa un código de conexión válido.');
  const codeHash = createHash('sha256').update(normalized).digest('hex');
  const result = await displayService.pairWithCode(codeHash);
  if (!result.ok || !result.display || !result.token) {
    throw new HTTPError(401, result.reason === 'display_inactive'
      ? 'Esta pantalla está desactivada en administración.'
      : 'El código no es válido, venció o ya fue utilizado.', { code: 'DISPLAY_PAIR_INVALID' });
  }
  const display = result.display;
  await displayService.heartbeat(display.id, true, { software, os_version });
  const snapshot = await displayService.snapshot(display.id);
  const registered: RegisterDisplayResult = {
    display: { id: display.id, name: display.name, code: display.code, branch_id: display.branch_id },
    wsUrl: wsUrlFor(req),
    snapshot,
  };
  res.json({ ok: true, ...registered, token: result.token });
});

function header(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readCredentials(req: Request): { code?: string; token?: string } {
  const auth = req.headers.authorization;
  const token = Array.isArray(auth) ? auth[0] : auth;
  return {
    code: header(req, 'x-display-code'),
    token: token?.startsWith('Bearer ') ? token.slice(7).trim() : undefined,
  };
}

function wsUrlFor(req: Request): string {
  if (env.publicBaseUrl) {
    const base = env.publicBaseUrl.replace(/^https?:\/\//, '');
    return `wss://${base}/api/displays/ws`;
  }
  const proto = req.headers['x-forwarded-proto'] === 'https' || req.secure ? 'wss' : 'ws';
  return `${proto}://${req.get('host')}/api/displays/ws`;
}

/** POST /api/displays/register — la TV se identifica con código + token. */
export const register = asyncHandler(async (req: Request, res: Response) => {
  const { code, token, software, os_version } = req.body as {
    code?: string;
    token?: string;
    software?: string;
    os_version?: string;
  };
  if (!code || !token) {
    throw HTTPError.badRequest('Faltan código de pantalla o token.');
  }

  const display = await displayService.assertAuthenticated(code, token);

  await displayService.heartbeat(display.id, true, { software, os_version });

  const snapshot = await displayService.snapshot(display.id);

  const result: RegisterDisplayResult = {
    display: { id: display.id, name: display.name, code: display.code, branch_id: display.branch_id },
    wsUrl: wsUrlFor(req),
    snapshot,
  };
  res.json({ ok: true, ...result });
});

/** GET /api/displays/snapshot — snapshot aislado (auth por headers). */
export const snapshot = asyncHandler(async (req: Request, res: Response) => {
  const { code, token } = readCredentials(req);
  if (!code || !token) throw HTTPError.unauthorized('Faltan credenciales de la pantalla.');

  const display = await displayService.assertAuthenticated(code, token);
  const snap = await displayService.snapshot(display.id);

  res.json({ ok: true, snapshot: snap });
});
