import { NextFunction, Request, Response } from 'express';

import { authService } from '../services/auth.service';
import { HTTPError } from '../utils/http-error';

/**
 * Verifica el access token (Bearer) contra Supabase Auth y carga el
 * empleado. El backend nunca confía en roles enviados por el cliente.
 */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(HTTPError.unauthorized('Token de acceso requerido.'));
  }
  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(HTTPError.unauthorized('Token de acceso requerido.'));
  }
  try {
    req.user = await authService.getAuthenticatedUser(token);
    next();
  } catch (err) {
    next(err);
  }
}