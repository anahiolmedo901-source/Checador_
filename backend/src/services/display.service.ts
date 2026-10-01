import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import {
  AuthenticatedDisplay,
  DisplayAuthResult,
  DisplaySnapshot,
} from '../types';
import { HTTPError } from '../utils/http-error';

const MEDIA_BUCKET = 'media';

/**
 * Servicio de Smart Display (Fase 3).
 *
 * - `display_authenticate` (RPC, service_role): la pantalla se identifica con
 *   código + token en claro; el servidor compara contra el hash y devuelve el
 *   estado. Es el "mecanismo propio de identificación" de la TV.
 * - `display_snapshot` (RPC): agregados + avisos + playlist (sin datos
 *   sensibles). Aquí se enriquecen las URLs firmadas de media.
 */
export const displayService = {
  async pairWithCode(codeHash: string): Promise<{ ok: boolean; reason?: string; token?: string; display?: AuthenticatedDisplay }> {
    const { data, error } = await supabaseAdmin.rpc('display_pair_with_code', { p_code_hash: codeHash });
    if (error) {
      throw new HTTPError(503, 'No se pudo vincular la pantalla.', {
        code: 'DISPLAY_PAIR_SERVICE',
        details: error.message,
      });
    }
    return data as { ok: boolean; reason?: string; token?: string; display?: AuthenticatedDisplay };
  },

  async authenticate(code: string, token: string): Promise<DisplayAuthResult> {
    const { data, error } = await supabaseAdmin.rpc('display_authenticate', {
      p_code: code,
      p_token: token,
    });
    if (error) {
      throw new HTTPError(503, 'No se pudo validar la pantalla.', {
        code: 'DISPLAY_AUTH_SERVICE',
        details: error.message,
      });
    }
    return data as DisplayAuthResult;
  },

  async assertAuthenticated(code: string, token: string): Promise<AuthenticatedDisplay> {
    const result = await this.authenticate(code, token);
    if (!result.ok) {
      throw new HTTPError(
        401,
        result.reason === 'token_revoked'
          ? 'El token de esta pantalla fue revocado.'
          : 'Pantalla no autorizada. Verifica el token.',
        { code: `DISPLAY_${String(result.reason).toUpperCase()}` }
      );
    }
    if (!result.display || !result.display.branch_id) {
      throw HTTPError.badRequest('La pantalla no tiene sucursal asignada.');
    }
    return result.display;
  },

  async snapshot(displayId: string): Promise<DisplaySnapshot> {
    const { data, error } = await supabaseAdmin.rpc('display_snapshot', {
      p_display_id: displayId,
    });
    if (error || !data) {
      throw new HTTPError(503, 'No se pudo construir el tablero.', {
        code: 'DISPLAY_SNAPSHOT_ERROR',
        details: error?.message,
      });
    }
    return this.resolveMedia(data as DisplaySnapshot);
  },

  async heartbeat(displayId: string, online: boolean, meta?: { software?: string; os_version?: string }): Promise<void> {
    await supabaseAdmin.rpc('display_heartbeat', {
      p_display_id: displayId,
      p_online: online,
      p_software: meta?.software ?? null,
      p_os_version: meta?.os_version ?? null,
    });
  },

  /** Firma URLs de media (bucket privado) para que la TV pueda reproducirlas. */
  async resolveMedia(snapshot: DisplaySnapshot): Promise<DisplaySnapshot> {
    await Promise.all(
      snapshot.playlist.map(async (item) => {
        if (item.item_type !== 'media' || !item.media?.file_path || item.media.signed_url) return;
        const { data, error } = await supabaseAdmin.storage
          .from(MEDIA_BUCKET)
          .createSignedUrl(item.media.file_path, Math.max(env.signedUrlExpiresS, 600));
        item.media.kind = item.media.kind ?? 'image';
        item.media.signed_url = error ? null : (data?.signedUrl ?? null);
      })
    );
    return snapshot;
  },
};
