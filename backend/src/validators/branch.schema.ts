import { z } from './common';

export const createBranchSchema = z.object({
  body: z.object({
    name: z.string().trim().min(3).max(120),
    address: z.string().trim().max(255).nullish(),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    radius_m: z.number().min(1).max(5000).default(300),
  }),
});

export const updateBranchSchema = z.object({
  body: z
    .object({
      name: z.string().trim().min(3).max(120).optional(),
      address: z.string().trim().max(255).nullish(),
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
      radius_m: z.number().min(1).max(5000).optional(),
      active: z.boolean().optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No se enviaron campos.' }),
});