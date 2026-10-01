import { z } from './common';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD).');
const isoDateSchema = z.string().datetime({ offset: true });
const checkedDateSchema = dateSchema.refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'La fecha no existe.');

function businessDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}-${parts.find((p) => p.type === 'day')!.value}`;
}

function dateEntryRange(): { min: string; max: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const todayKey = `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}-${parts.find((p) => p.type === 'day')!.value}`;
  const minDate = new Date(`${todayKey}T00:00:00.000Z`);
  const maxDate = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth() + 3, 1));
  maxDate.setUTCDate(Math.min(minDate.getUTCDate(), new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth() + 1, 0)).getUTCDate()));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  return { min: key(minDate), max: key(maxDate) };
}

function isDateEntryAllowed(value: string): boolean {
  const range = dateEntryRange();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00.000Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && date.toISOString().slice(0, 10) !== value) return false;
  const key = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : businessDateKey(date);
  return key >= range.min && key <= range.max;
}

export const dashboardQuerySchema = z.object({
  query: z.object({
    date: checkedDateSchema.optional(),
  }),
});

const attendanceStatusSchema = z.enum(['on_time', 'late', 'out_of_window', 'excused', 'missing', 'all']);

export const attendanceListQuerySchema = z.object({
  query: z.object({
    from: checkedDateSchema.optional(),
    to: checkedDateSchema.optional(),
    employee_id: z.string().uuid().optional(),
    department_id: z.string().uuid().optional(),
    branch_id: z.string().uuid().optional(),
    status: attendanceStatusSchema.optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional(),
  }).superRefine(({ from, to }, ctx) => {
    if (from && to && from > to) ctx.addIssue({ code: 'custom', path: ['to'], message: 'La fecha Hasta debe ser igual o posterior a Desde.' });
  }),
});

export const attendanceEditSchema = z.object({
  params: z.object({ eventId: z.string().uuid('Debe ser un UUID válido.') }),
  body: z
    .object({
      happened_at: isoDateSchema.nullable().optional(),
      status: z.enum(['on_time', 'late', 'out_of_window']).optional(),
      motivo: z.string().trim().min(3, 'El motivo debe tener al menos 3 caracteres.').max(500),
    })
    .refine((v) => v.happened_at !== undefined || v.status !== undefined, {
      message: 'Indica una hora o un estatus nuevo.',
    }),
});

export const offtimeListQuerySchema = z.object({
  query: z.object({
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const createOffSchema = z.object({
  body: z.object({
    employee_id: z.string().uuid(),
    off_type: z.enum(['permission', 'vacation', 'incapacity']),
    starts_on: checkedDateSchema,
    ends_on: checkedDateSchema,
    reason: z.string().trim().min(3).max(500),
  }).superRefine(({ starts_on, ends_on }, ctx) => {
  if (!isDateEntryAllowed(starts_on)) ctx.addIssue({ code: 'custom', path: ['starts_on'], message: 'La fecha debe ser desde hoy y dentro de los próximos 3 meses.' });
  if (!isDateEntryAllowed(ends_on)) ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'La fecha debe ser desde hoy y dentro de los próximos 3 meses.' });
  if (starts_on > ends_on) ctx.addIssue({ code: 'custom', path: ['ends_on'], message: 'La fecha de fin debe ser igual o posterior al inicio.' });
  }),
});

export const reviewOffSchema = z.object({
  params: z.object({ id: z.string().uuid('Debe ser un UUID válido.') }),
  body: z.object({
    approved: z.boolean(),
    note: z.string().trim().max(500).optional(),
  }),
});

export const incidentsListQuerySchema = z.object({
  query: z.object({
    status: z.enum(['open', 'resolved']).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const createIncidentSchema = z.object({
  body: z.object({
    employee_id: z.string().uuid(),
    incident_type: z.enum(['late', 'absent', 'out_of_window', 'location', 'device', 'duplicate', 'other']),
    severity: z.enum(['info', 'warning', 'critical']).default('info'),
    detail: z.record(z.unknown()).optional(),
  }),
});

export const resolveIncidentSchema = z.object({
  params: z.object({ id: z.string().uuid('Debe ser un UUID válido.') }),
  body: z.object({ note: z.string().trim().max(500).optional() }),
});

export const announcementsListQuerySchema = z.object({
  query: z.object({
    active: z.enum(['true', 'false']).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const createAnnouncementSchema = z.object({
  body: z.object({
    title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(1).max(5000),
    audience_role: z.array(z.enum(['admin', 'hr', 'employee'])).optional(),
    priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
    published_at: isoDateSchema.optional(),
    expires_at: isoDateSchema.nullable().optional(),
    active: z.boolean().default(true),
  }).superRefine(({ published_at, expires_at }, ctx) => {
  for (const field of ['published_at', 'expires_at'] as const) {
    const value = field === 'published_at' ? published_at : expires_at;
    if (value && !isDateEntryAllowed(value)) {
      ctx.addIssue({ code: 'custom', path: [field], message: 'La fecha debe ser desde hoy y dentro de los próximos 3 meses.' });
    }
  }
  if (published_at && expires_at && Date.parse(expires_at) < Date.parse(published_at)) {
    ctx.addIssue({ code: 'custom', path: ['expires_at'], message: 'La expiración debe ser igual o posterior a la publicación.' });
  }
  }),
});

export const updateAnnouncementSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(3).max(160).optional(),
      body: z.string().trim().min(1).max(5000).optional(),
      audience_role: z.array(z.enum(['admin', 'hr', 'employee'])).nullable().optional(),
      priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
      published_at: isoDateSchema.optional(),
      expires_at: isoDateSchema.nullable().optional(),
      active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' })
    .superRefine((v, ctx) => {
      for (const field of ['published_at', 'expires_at'] as const) {
        const value = v[field];
        if (value && !isDateEntryAllowed(value)) ctx.addIssue({ code: 'custom', path: [field], message: 'La fecha debe ser desde hoy y dentro de los próximos 3 meses.' });
      }
      if (v.published_at && v.expires_at && Date.parse(v.expires_at) < Date.parse(v.published_at)) {
        ctx.addIssue({ code: 'custom', path: ['expires_at'], message: 'La expiración debe ser igual o posterior a la publicación.' });
      }
    }),
});

export const mediaListQuerySchema = z.object({
  query: z.object({
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const createMediaSchema = z.object({
  body: z.object({
    kind: z.enum(['image', 'video', 'url']),
    title: z.string().trim().min(1).max(160),
    url: z.string().url('URL inválida.').nullable().optional(),
    mime_type: z.string().trim().max(120).nullable().optional(),
    size_bytes: z.number().int().nonnegative().nullable().optional(),
    duration_s: z.number().int().nonnegative().nullable().optional(),
  }),
});

export const updateMediaSchema = z.object({
  body: z
    .object({
      title: z.string().trim().min(1).max(160).optional(),
      url: z.string().url('URL inválida.').nullable().optional(),
      duration_s: z.number().int().nonnegative().nullable().optional(),
      active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' }),
});

export const playlistQuerySchema = z.object({
  query: z.object({
    display_id: z.string().uuid(),
  }),
});

export const addPlaylistItemSchema = z.object({
  body: z
    .object({
      display_id: z.string().uuid(),
      item_type: z.enum(['announcement', 'media']),
      item_id: z.string().uuid(),
      duration_s: z.number().int().min(1).max(3600).default(15),
      position: z.number().int().min(0).optional(),
    })
    .refine((v) => v.item_id.length > 0, { message: 'Se requiere el ítem.' }),
});

export const updatePlaylistItemSchema = z.object({
  params: z.object({ itemId: z.string().uuid('Debe ser un UUID válido.') }),
  body: z.object({
    duration_s: z.number().int().min(1).max(3600).optional(),
    position: z.number().int().min(0).optional(),
    active: z.boolean().optional(),
  }),
});

export const createDisplaySchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(120),
    branch_id: z.string().uuid().nullable().optional(),
    settings: z.record(z.unknown()).optional(),
  }),
});

export const updateDisplaySchema = z.object({
  params: z.object({ id: z.string().uuid('Debe ser un UUID válido.') }),
  body: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      branch_id: z.string().uuid().nullable().optional(),
      settings: z.record(z.unknown()).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' }),
});

export const setDisplayActiveSchema = z.object({
  params: z.object({ id: z.string().uuid('Debe ser un UUID válido.') }),
  body: z.object({ active: z.boolean() }),
});

export const displayTokenSchema = z.object({
  params: z.object({ id: z.string().uuid('Debe ser un UUID válido.') }),
});

export const devicesListQuerySchema = z.object({
  query: z.object({
    authorization: z.enum(['authorized', 'pending', 'denied']).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const updateDeviceSchema = z.object({
  params: z.object({ id: z.string().uuid('Debe ser un UUID válido.') }),
  body: z
    .object({
      authorization: z.enum(['authorized', 'pending', 'denied']).optional(),
      is_active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' }),
});

export const auditListQuerySchema = z.object({
  query: z.object({
    entity: z.string().trim().max(60).optional(),
    search: z.string().trim().max(80).optional(),
    page: z.coerce.number().int().min(1).max(1_000_000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  }),
});

export const reportQuerySchema = z.object({
  query: z.object({
    from: checkedDateSchema,
    to: checkedDateSchema,
    department_id: z.string().uuid().optional(),
    branch_id: z.string().uuid().optional(),
  }).refine(({ from, to }) => from <= to, { path: ['to'], message: 'La fecha Hasta debe ser igual o posterior a Desde.' }),
});

export const reportDimensionQuerySchema = z.object({
  query: z.object({
    from: checkedDateSchema,
    to: checkedDateSchema,
    dimension: z.enum(['employee', 'department', 'branch']),
    department_id: z.string().uuid().optional(),
    branch_id: z.string().uuid().optional(),
  }).refine(({ from, to }) => from <= to, { path: ['to'], message: 'La fecha Hasta debe ser igual o posterior a Desde.' }),
});
