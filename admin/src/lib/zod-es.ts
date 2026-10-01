import { z } from 'zod';

/** Mensajes de validación en español para todos los formularios (zod). */
const map: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Campo obligatorio.' };
      if (issue.expected === 'number') return { message: 'Ingresa un número válido.' };
      return { message: 'Valor no válido.' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string')
        return {
          message:
            issue.minimum === 1 ? 'Campo obligatorio.' : `Debe tener al menos ${issue.minimum} caracteres.`,
        };
      if (issue.type === 'number') return { message: `Debe ser mayor o igual a ${issue.minimum}.` };
      if (issue.type === 'array') return { message: `Selecciona al menos ${issue.minimum}.` };
      break;
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Máximo ${issue.maximum} caracteres.` };
      if (issue.type === 'number') return { message: `Debe ser menor o igual a ${issue.maximum}.` };
      break;
    case z.ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Correo electrónico no válido.' };
      if (issue.validation === 'url') return { message: 'Enlace no válido.' };
      if (issue.validation === 'uuid') return { message: 'Identificador no válido.' };
      if (issue.validation === 'regex') return { message: 'Formato no válido.' };
      break;
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Elige una opción válida.' };
    case z.ZodIssueCode.invalid_date:
      return { message: 'Fecha no válida.' };
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(map);
