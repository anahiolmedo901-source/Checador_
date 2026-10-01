import { supabaseAdmin } from '../config/supabase';
import { HTTPError } from '../utils/http-error';

interface AuditWriteInput {
  actorId: string;
  action: string;
  entity: string;
  entityId?: string | null;
  oldData?: unknown | null;
  newData?: unknown | null;
  metadata?: Record<string, unknown>;
}

/**
 * Escribe una entrada de auditoría con actor explícito a través de la
 * RPC `admin_write_audit` (security definer, service_role only). El
 * backend pasa req.user.id como actor: la UI nunca decide el autor.
 */
export const auditService = {
  async write(input: AuditWriteInput): Promise<void> {
    const { error } = await supabaseAdmin.rpc('admin_write_audit', {
      p_actor_id: input.actorId,
      p_action: input.action,
      p_entity: input.entity,
      p_entity_id: input.entityId ?? null,
      p_old_data: input.oldData ?? null,
      p_new_data: input.newData ?? null,
      p_metadata: input.metadata ?? {},
    });
    if (error) {
      throw new HTTPError(500, 'No se pudo registrar la auditoría.', {
        code: 'AUDIT_ERROR',
        details: error.message,
      });
    }
  },
};