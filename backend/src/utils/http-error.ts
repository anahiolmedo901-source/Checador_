export class HTTPError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = 'HTTPError';
    this.status = status;
    this.code = options?.code ?? 'HTTP_ERROR';
    this.details = options?.details;
  }

  static badRequest(message: string, details?: unknown): HTTPError {
    return new HTTPError(400, message, { code: 'BAD_REQUEST', details });
  }

  static unauthorized(message = 'No autenticado.'): HTTPError {
    return new HTTPError(401, message, { code: 'UNAUTHORIZED' });
  }

  static forbidden(message = 'No tienes permiso para esta acción.'): HTTPError {
    return new HTTPError(403, message, { code: 'FORBIDDEN' });
  }

  static notFound(message = 'Recurso no encontrado.'): HTTPError {
    return new HTTPError(404, message, { code: 'NOT_FOUND' });
  }

  static conflict(message: string, details?: unknown): HTTPError {
    return new HTTPError(409, message, { code: 'CONFLICT', details });
  }

  static validation(details: unknown): HTTPError {
    return new HTTPError(400, 'Datos de entrada inválidos.', { code: 'VALIDATION_ERROR', details });
  }
}