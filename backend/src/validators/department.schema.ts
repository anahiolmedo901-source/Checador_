import { z } from './common';

export const createDepartmentSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3, 'El nombre es requerido.').max(120),
    code: z
      .string()
      .trim()
      .min(2)
      .max(10)
      .regex(/^[A-Za-z0-9_-]+$/, 'Código inválido.'),
  }),
});

export const updateDepartmentSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(3).max(120).optional(),
      code: z.string().trim().min(2).max(10).optional(),
      active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' }),
});