import { EventEmitter } from 'events';
import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import { displayService } from './display.service';
import { logger } from '../utils/logger';
import { DisplaySnapshot } from '../types';

interface DisplaySocket extends WebSocket {
  isAlive?: boolean;
  displayId?: string;
  code?: string;
  branchId?: string | null;
  software?: string;
  osVersion?: string;
}

const WS_HEARTBEAT_MS = env.displayWsHeartbeatMs;
const REFRESH_DEBOUNCE_MS = 600;

function extractCredentials(request: { headers: Record<string, string | string[] | undefined> }): {
  code?: string;
  token?: string;
} {
  const rawAuth = request.headers['authorization'];
  const auth = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
  const token = auth?.startsWith('Bearer ') ? auth.slice(7).trim() : undefined;
  const rawCode = request.headers['x-display-code'];
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  if (token && code) return { code, token };

  // Los navegadores (pantalla web / WebView) no pueden fijar headers custom en
  // WebSocket, pero sí subprotocolos: ['dc-<code>', 'tk-<token>'].
  const rawProto = request.headers['sec-websocket-protocol'];
  const protos = Array.isArray(rawProto) ? rawProto.join(',') : rawProto ?? '';
  let protoCode: string | undefined;
  let protoToken: string | undefined;
  for (const p of protos.split(',')) {
    const item = p.trim();
    if (item.startsWith('dc-')) protoCode = item.slice(3);
    else if (item.startsWith('tk-')) protoToken = item.slice(3);
  }
  if (protoCode && protoToken) return { code: protoCode, token: protoToken };
  return { code, token };
}

/**
 * Gateway de Smart Displays.
 *
 * - Un WebSocketServer sobre el mismo servidor HTTP (path /api/displays/ws).
 * - Autenticación propia al conectar: código + token (headers), la pantalla
 *   queda identificada antes de recibir cualquier dato.
 * - Bridge Supabase Realtime → TV: un solo canal suscrito, filtra por sucursal
 *   y reenvía eventos sanizados; los cambios de conteos/avisos/playlist se
 *   debouncean y re-emiten como snapshot.
 * - Sin polling: la TV escucha; el servidor empuja.
 */
class DisplayGateway extends EventEmitter {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, DisplaySocket>(); // displayId -> socket
  private byBranch = new Map<string, Set<string>>(); // branchId -> displayIds
  private refreshTimers = new Map<string, NodeJS.Timeout>(); // branchId -> timer
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private started = false;

  attach(server: Server): void {
    if (this.started) return;
    this.started = true;

    this.wss = new WebSocketServer({ server, path: '/api/displays/ws' });

    this.wss.on('connection', (socket: DisplaySocket, request) => {
      const { code, token } = extractCredentials(request);
      if (!code || !token) {
        this.reject(socket, 'credentials_missing');
        return;
      }

      void displayService
        .assertAuthenticated(code, token)
        .then((display) => {
          socket.displayId = display.id;
          socket.code = display.code;
          socket.branchId = display.branch_id;
          socket.isAlive = true;
          socket.on('pong', () => {
            socket.isAlive = true;
          });

          const previous = this.clients.get(display.id);
          if (previous) {
            this.send(previous, { type: 'replaced' });
            previous.close(4001, 'replaced by newer connection');
          }
          this.clients.set(display.id, socket);
          if (display.branch_id) this.link(display.branch_id, display.id);

          this.send(socket, {
            type: 'hello',
            displayId: display.id,
            code: display.code,
            branchId: display.branch_id,
            ts: new Date().toISOString(),
          });

          void displayService
            .snapshot(display.id)
            .then((snapshot) => this.send(socket, { type: 'snapshot', snapshot }))
            .catch((err) => logger.warn({ err, displayId: display.id }, 'snapshot inicial falló'));

          void displayService.heartbeat(display.id, true).catch((err) => {
            logger.warn({ err, displayId: display.id }, 'heartbeat online falló');
          });

          this.startHeartbeat();
        })
        .catch(() => {
          this.reject(socket, 'unauthorized');
        });

      socket.on('message', (raw) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(raw)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (msg.type === 'heartbeat' && socket.displayId) {
          void displayService.heartbeat(socket.displayId, true, {
            software: socket.software,
            os_version: socket.osVersion,
          }).catch(() => undefined);
        }
        if (msg.type === 'meta' && typeof msg.software === 'string') socket.software = msg.software;
        if (msg.type === 'meta' && typeof msg.os_version === 'string') socket.osVersion = msg.os_version;
      });

      socket.on('close', () => this.unregister(socket));
      socket.on('error', () => this.unregister(socket));
    });

    this.wss.on('error', (err) => logger.error({ err }, 'WebSocketServer error'));
    this.subscribeRealtime();
  }

  private reject(socket: DisplaySocket, reason: string): void {
    try {
      this.send(socket, { type: 'unauthorized', reason });
      socket.close(4003, reason);
    } catch {
      socket.terminate();
    }
  }

  private link(branchId: string, displayId: string): void {
    const set = this.byBranch.get(branchId) ?? new Set<string>();
    set.add(displayId);
    this.byBranch.set(branchId, set);
  }

  private unregister(socket: DisplaySocket): void {
    if (socket.branchId && socket.displayId) {
      const set = this.byBranch.get(socket.branchId);
      if (set) {
        set.delete(socket.displayId);
        if (set.size === 0) this.byBranch.delete(socket.branchId);
      }
      this.clients.delete(socket.displayId);
      void displayService.heartbeat(socket.displayId, false).catch(() => undefined);
    }
  }

  private send(socket: WebSocket, payload: unknown): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  private broadcastTo(branchId: string, payload: unknown): void {
    const ids = this.byBranch.get(branchId);
    if (!ids) return;
    for (const displayId of ids) {
      const socket = this.clients.get(displayId);
      if (socket) this.send(socket, payload);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const socket of this.clients.values()) {
        if (socket.isAlive === false) {
          socket.terminate();
          continue;
        }
        socket.isAlive = false;
        try {
          socket.ping();
        } catch {
          socket.terminate();
        }
        this.send(socket, { type: 'ping', ts: new Date().toISOString() });
      }
    }, WS_HEARTBEAT_MS);
    this.heartbeatTimer.unref();
  }

  /** Recomponer el snapshot de cada display de la sucursal (debounceado). */
  private scheduleRefresh(branchId: string | null | undefined): void {
    if (!branchId) return;
    if (this.refreshTimers.get(branchId)) return;
    const timer = setTimeout(() => {
      this.refreshTimers.delete(branchId);
      const ids = this.byBranch.get(branchId);
      if (!ids) return;
      for (const displayId of ids) {
        const socket = this.clients.get(displayId);
        if (!socket) continue;
        void displayService
          .snapshot(displayId)
          .then((snapshot: DisplaySnapshot) => this.send(socket, { type: 'snapshot', snapshot }))
          .catch((err) => logger.warn({ err, displayId }, 'snapshot refresh falló'));
      }
    }, REFRESH_DEBOUNCE_MS);
    this.refreshTimers.set(branchId, timer);
  }

  private revokeDisplay(displayId: string): void {
    const socket = this.clients.get(displayId);
    if (socket) {
      this.send(socket, { type: 'revoked' });
      socket.close(4003, 'token revoked');
    }
  }

  /** Una sola suscripción Realtime; filtra por sucursal y reenvía. */
  private subscribeRealtime(): void {
    supabaseAdmin
      .channel('checador-displays')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attendance' }, (payload) => {
        const row = payload.new as { branch_id?: string | null; employee_id?: string | null; check_type?: string; happened_at?: string };
        const branchId = row.branch_id ?? null;
        if (!branchId || !this.byBranch.has(branchId)) return;

        if (row.check_type && row.employee_id) {
          void (async () => {
            try {
              const { data } = await supabaseAdmin
                .from('employees')
                .select('full_name')
                .eq('id', row.employee_id)
                .maybeSingle();
              const name = data?.full_name ?? 'Empleado';
              const delivered = new Date(row.happened_at ?? new Date().toISOString());
              const check = {
                name,
                check_type: row.check_type,
                happened_at: row.happened_at ?? new Date().toISOString(),
                time: delivered.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' }),
                full_time: delivered.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              };
              this.broadcastTo(branchId, { type: 'check', check });
              this.emit('check', {
                branch_id: branchId,
                displays: Array.from(this.byBranch.get(branchId) ?? []),
                check,
              });
            } catch {
              // el snapshot debounced cubre el caso de error
            }
          })();
        }
        this.scheduleRefresh(branchId);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'attendance' }, (payload) => {
        const row = (payload.new ?? payload.old) as { branch_id?: string | null };
        this.scheduleRefresh(row.branch_id ?? null);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'attendance' }, (payload) => {
        const row = payload.old as { branch_id?: string | null };
        this.scheduleRefresh(row.branch_id ?? null);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        this.refreshAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'media' }, () => {
        this.refreshAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_playlists' }, (payload) => {
        const row = payload.new as { display_id?: string | null };
        if (row.display_id) {
          const socket = this.clients.get(row.display_id);
          const branchId = socket?.branchId;
          if (branchId) {
            this.send(socket, { type: 'refresh' });
            this.scheduleRefresh(branchId);
          }
        } else {
          this.refreshAll();
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'displays' }, (payload) => {
        const row = payload.new as { id?: string; is_active?: boolean };
        if (row.id && row.is_active === false) this.revokeDisplay(row.id);
        this.refreshAll();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'display_tokens' }, (payload) => {
        const row = payload.new as { display_id?: string | null; active?: boolean };
        if (row.display_id && row.active === false) this.revokeDisplay(row.display_id);
      })
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          logger.info('Realtime de displays suscrito.');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.warn({ status, err }, 'Realtime de displays con problemas; reintento automático de supabase-js');
        }
      });
  }

  private refreshAll(): void {
    const branches = Array.from(this.byBranch.keys());
    for (const branchId of branches) {
      this.scheduleRefresh(branchId);
    }
  }
}

export const displayGateway = new DisplayGateway();