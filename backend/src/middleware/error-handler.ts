import { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import multer from 'multer';

import { logger } from '../utils/logger';
import { HTTPError } from '../utils/http-error';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Ruta no encontrada.' },
  });
};

function isMulterError(err: unknown): err is multer.MulterError {
  return err instanceof multer.MulterError;
}

export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof HTTPError) {
    res.status(err.status).json({
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  // Multer (fileFilter / límites de tamaño): el cliente envió algo inválido (400), no es un error interno.
  if (isMulterError(err)) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_UPLOAD', message: err.message },
    });
    return;
  }

  logger.error({ err, method: req.method, url: req.url }, 'Error no controlado');
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Error interno del servidor.',
    },
  });
};