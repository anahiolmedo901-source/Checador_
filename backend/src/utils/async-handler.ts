import { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Envuelve un handler async para que sus rechazos lleguen al middleware
 * central de errores (evita exponer stack traces o crashear el proceso).
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Envuelve todos los métodos de un controlador async para que sus rechazos
 * lleguen al middleware central de errores (Express 4 no captura rejections
 * de handlers async automáticamente).
 */
export function withAsync<T extends Record<string, Function>>(controller: T): T {
  const out = {} as Record<string, Function>;
  for (const [key, fn] of Object.entries(controller)) {
    out[key] = (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }
  return out as T;
}