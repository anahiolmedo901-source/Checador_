import { supabaseAdmin } from '../config/supabase';
import { EmployeeRole } from '../types';

interface CacheEntry {
  expiresAt: number;
  value: boolean;
}

const TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Consulta el catálogo RBAC (`role_permissions`). El rol `admin` tiene la
 * acción `*` que cubre cualquier permiso. Resultados cacheados 60 s.
 */
export const permissionService = {
  async has(role: EmployeeRole, action: string): Promise<boolean> {
    const key = `${role}:${action}`;
    const cached = cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const { data, error } = await supabaseAdmin
      .from('role_permissions')
      .select('action')
      .eq('role', role as never)
      .or(`action.eq.${action},action.eq.*`)
      .limit(1);

    const value = !error && (data?.length ?? 0) > 0;
    cache.set(key, { expiresAt: Date.now() + TTL_MS, value });
    return value;
  },

  /** ¿Tiene al menos uno de los permisos dados? */
  async hasAny(role: EmployeeRole, actions: string[]): Promise<boolean> {
    for (const action of actions) {
      if (await this.has(role, action)) return true;
    }
    return false;
  },

  /** Invalida el caché (útil tras cambios RBAC y en pruebas). */
  invalidate(): void {
    cache.clear();
  },
};