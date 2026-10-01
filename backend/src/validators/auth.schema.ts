import { z } from './common';

export const loginSchema = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .min(3, 'Ingresa tu clave o correo.')
      .max(320)
      .refine((v) => !v.includes('@') || z.string().email().safeParse(v).success, {
        message: 'Correo inválido.',
      }),
    password: z.string().min(1, 'Contraseña requerida.').max(128),
  }),
});

export const createUserSchema = z.object({
  body: z.object({
    code: z
      .string()
      .trim()
      .min(3, 'Código debe tener al menos 3 caracteres.')
      .max(20)
      .regex(/^[A-Za-z0-9_-]+$/, 'Código solo puede contener letras, números, - y _.'),
    full_name: z
      .string()
      .trim()
      .min(3, 'Nombre completo requerido.')
      .max(160),
    password: z
      .string()
      .min(8, 'El NIP/contraseña debe tener al menos 8 caracteres.')
      .max(128),
    role: z.enum(['admin', 'hr', 'employee']).default('employee'),
    branch_id: z.string().uuid().nullish(),
    department_id: z.string().uuid().nullish(),
    position_id: z.string().uuid().nullish(),
  }),
});

export const updateUserSchema = z.object({
  body: z
    .object({
      password: z.string().min(8).max(128).optional(),
      role: z.enum(['admin', 'hr', 'employee']).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, {
      message: 'No se enviaron campos para actualizar.',
    }),
});