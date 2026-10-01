import { z } from './common';

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createScheduleSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3).max(120),
    code: z
      .string()
      .trim()
      .min(2)
      .max(24)
      .regex(/^[A-Za-z0-9_-]+$/, 'Código inválido.'),
    check_in: z.string().regex(timeRegex, 'Hora con formato HH:MM.'),
    check_out: z.string().regex(timeRegex, 'Hora con formato HH:MM.'),
    tolerance_min: z.number().int().min(0).max(120).default(5),
    break_min: z.number().int().min(0).max(600).default(30),
  }).superRefine(({ check_in, check_out }, ctx) => {
    if (check_out <= check_in) ctx.addIssue({ code: 'custom', path: ['check_out'], message: 'La salida debe ser posterior a la entrada. Los turnos nocturnos requieren configuración aparte.' });
  }),
});

export const updateScheduleSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(3).max(120).optional(),
      code: z.string().trim().min(2).max(24).optional(),
      check_in: z.string().regex(timeRegex).optional(),
      check_out: z.string().regex(timeRegex).optional(),
      tolerance_min: z.number().int().min(0).max(120).optional(),
      break_min: z.number().int().min(0).max(600).optional(),
      active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' })
    .superRefine(({ check_in, check_out }, ctx) => {
      if (check_in !== undefined && check_out !== undefined && check_out <= check_in) {
        ctx.addIssue({ code: 'custom', path: ['check_out'], message: 'La salida debe ser posterior a la entrada. Los turnos nocturnos requieren configuración aparte.' });
      }
    }),
});

export const assignScheduleSchema = z.object({
  body: z.object({
    schedule_id: z.string().uuid('schedule_id debe ser un UUID válido.'),
    effective_from: z.string().datetime().optional(),
    effective_to: z.string().datetime().nullish(),
  }).superRefine(({ effective_from, effective_to }, ctx) => {
    if (effective_from && effective_to && Date.parse(effective_to) < Date.parse(effective_from)) {
      ctx.addIssue({ code: 'custom', path: ['effective_to'], message: 'La fecha final debe ser igual o posterior a la inicial.' });
    }
  }),
});

export const employeeScheduleParamSchema = z.object({
  params: z.object({
    employeeId: z.string().uuid('Debe ser un UUID válido.'),
    assignmentId: z.string().uuid('Debe ser un UUID válido.').optional(),
  }),
});
