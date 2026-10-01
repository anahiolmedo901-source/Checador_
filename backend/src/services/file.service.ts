import { supabaseAdmin } from '../config/supabase';
import { env } from '../config/env';
import { EmployeeRole } from '../types';
import { HTTPError } from '../utils/http-error';
import { permissionService } from './permission.service';

export const fileService = {
  async createSignedUrl(
    bucket: 'attendance-evidence' | 'media' | 'avatars',
    path: string,
    expiresIn: number | undefined,
    context: { id: string; role: EmployeeRole }
  ): Promise<{ signedUrl: string | null }> {
    if (bucket !== 'attendance-evidence') {
      const allowed = await permissionService.has(context.role, 'files.read');
      if (!allowed) throw HTTPError.forbidden();
    } else if (context.role !== 'admin' && context.role !== 'hr') {
      const allowedSelf = await permissionService.has(context.role, 'files.attendance.self');
      const isOwn = path.startsWith(`${context.id}/`);
      if (!allowedSelf || !isOwn) throw HTTPError.forbidden();
    }

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn ?? env.signedUrlExpiresS);
    if (error) {
      throw new HTTPError(500, 'No se pudo generar la URL firmada.', {
        code: 'STORAGE_ERROR',
        details: error.message,
      });
    }
    if (!data) {
      throw HTTPError.notFound('Archivo no encontrado.');
    }
    return { signedUrl: data.signedUrl };
  },
};