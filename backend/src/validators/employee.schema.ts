import { z } from './common';

export const employeeListQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    search: z.string().trim().max(80).optional(),
    department_id: z.string().uuid().optional(),
    active: z.enum(['true', 'false']).optional(),
  }),
});

export const createEmployeeSchema = z.object({
  body: z.object({
    code: z
      .string()
      .trim()
      .min(3, 'Código debe tener al menos 3 caracteres.')
      .max(20)
      .regex(/^[A-Za-z0-9_-]+$/, 'Código solo puede contener letras, números, - y _.'),
    full_name: z.string().trim().min(3).max(160).optional(),
    first_name: z.string().trim().min(1).max(80).optional(),
    last_name: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').nullable().optional(),
    password: z.string().min(8).max(128),
    branch_id: z.string().uuid().nullish(),
    department_id: z.string().uuid().nullish(),
    position_id: z.string().uuid().nullish(),
  }),
});

export const updateEmployeeSchema = z.object({
  body: z
    .object({
      full_name: z.string().trim().min(3).max(160).optional(),
      first_name: z.string().trim().min(1).max(80).nullable().optional(),
      last_name: z.string().trim().min(1).max(80).nullable().optional(),
      phone: z.string().trim().max(30).nullable().optional(),
      hire_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).').nullable().optional(),
      branch_id: z.string().uuid().nullish(),
      department_id: z.string().uuid().nullish(),
      position_id: z.string().uuid().nullish(),
      active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, {
      message: 'No se enviaron campos para actualizar.',
    }),
});

export const deactivateEmployeeSchema = z.object({
  params: z.object({ id: z.string().uuid('Debe ser un UUID válido.') }),
});