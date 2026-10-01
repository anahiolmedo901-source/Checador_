import { z } from './common';

export const signedUrlSchema = z.object({
  body: z.object({
    bucket: z.enum(['attendance-evidence', 'media', 'avatars']),
    path: z
      .string()
      .min(1)
      .max(1024)
      .regex(/^[A-Za-z0-9/._-]+$/, 'Ruta inválida.'),
    expiresIn: z.number().int().min(60).max(3600).optional(),
  }),
});