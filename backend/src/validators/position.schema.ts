import { z } from './common';

export const createPositionSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3, 'El título es requerido.').max(120),
    code: z
      .string()
      .trim()
      .min(2)
      .max(10)
      .regex(/^[A-Za-z0-9_-]+$/, 'Código inválido.'),
    department_id: z.string().uuid().nullish(),
  }),
});

export const updatePositionSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(120).optional(),
      code: z.string().trim().min(2).max(10).optional(),
      department_id: z.string().uuid().nullish(),
      active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' }),
});