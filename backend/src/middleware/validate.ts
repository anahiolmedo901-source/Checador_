import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AnyZodObject } from 'zod';

import { HTTPError } from '../utils/http-error';

/**
 * Valida body / query / params contra un esquema Zod. En caso de error
 * responde 400 con el detalle de campos; si pasa, sustituye req.* con
 * los valores ya parseados (coerciones/trim aplicados).
 */
export function validate(schema: AnyZodObject): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      return next(HTTPError.validation(result.error.flatten().fieldErrors));
    }
    const parsed = result.data as Record<string, unknown>;
    if (parsed.body !== undefined) req.body = parsed.body;
    if (parsed.query !== undefined) req.query = parsed.query as Request['query'];
    if (parsed.params !== undefined) req.params = parsed.params as Request['params'];
    next();
  };
}