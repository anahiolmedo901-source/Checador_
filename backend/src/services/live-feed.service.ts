import type { Response } from 'express';

const PING_INTERVAL_MS = 15_000;

/**
 * Hub de Server-Sent Events para el panel web.
 *
 * El gateway de Smart Displays emite eventos (p. ej. un checado proyectado en
 * una sucursal) y este servicio los reenvía a los clientes web suscritos.
 * Cada cliente admin se autentica vía middleware (JWT + permiso) antes de
 * llegar aquí; la respuesta se mantiene abierta y se limpia al desconectar.
 */
class LiveFeedService {
  private clients = new Set<Response>();
  private pingTimer: NodeJS.Timeout | null = null;

  register(res: Response): void {
    this.clients.add(res);
    res.on('close', () => {
      this.clients.delete(res);
    });
    this.startPing();
  }

  writeEvent(event: string, data: unknown): void {
    const body = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(body);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  private startPing(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      for (const res of this.clients) {
        try {
          res.write(': ping\n\n');
        } catch {
          this.clients.delete(res);
        }
      }
      if (this.clients.size === 0 && this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
    }, PING_INTERVAL_MS);
    this.pingTimer.unref();
  }
}

export const liveFeedService = new LiveFeedService();