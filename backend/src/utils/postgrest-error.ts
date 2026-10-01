import { PostgrestError } from '@supabase/supabase-js';

import { HTTPError } from './http-error';

/** Mapea errores de PostgREST a HTTPError legibles, sin filtrar detalles. */
export function throwPostgrest(error: PostgrestError): never {
  switch (error.code) {
    case '23505':
      throw HTTPError.conflict('Registro duplicado.', { detail: error.message });
    case '23503':
      throw HTTPError.badRequest('Referencia inválida: el registro referenciado no existe.', {
        detail: error.message,
      });
    case '22P02':
      throw HTTPError.badRequest('Identificador inválido.', { detail: error.message });
    case 'PGRST116':
      throw HTTPError.notFound('Registro no encontrado.');
    default:
      throw new HTTPError(500, 'Error de base de datos.', {
        code: 'DB_ERROR',
        details: error.message,
      });
  }
}