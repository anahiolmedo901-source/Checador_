import { NextFunction, Request, RequestHandler, Response } from 'express';

import { permissionService } from '../services/permission.service';
import { EmployeeRole } from '../types';
import { HTTPError } from '../utils/http-error';

function loadUser(req: Request): { id: string; role: EmployeeRole } {
  if (!req.user) throw HTTPError.unauthorized();
  return { id: req.user.id, role: req.user.role };
}

/** Exige un permiso específico del catálogo RBAC (acción). */
export function requirePermission(action: string): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = loadUser(req);
      const allowed = await permissionService.has(user.role, action);
      if (!allowed) throw HTTPError.forbidden(`Se requiere el permiso "${action}".`);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Exige al menos uno de los permisos dados. */
export function requireAnyPermission(actions: string[]): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const user = loadUser(req);
      const allowed = await permissionService.hasAny(user.role, actions);
      if (!allowed) throw HTTPError.forbidden('No tienes permiso para esta acción.');
      next();
    } catch (err) {
      next(err);
    }
  };
}