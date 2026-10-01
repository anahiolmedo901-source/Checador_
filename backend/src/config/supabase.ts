import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { env } from './env';

/**
 * Cliente ANON: autenticación de usuarios (sign-in) y validación de
 * tokens (getUser). Nunca se usa para leer datos de negocio.
 */
export const supabaseAuth: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

/**
 * Cliente SERVICE ROLE: acceso a Postgres/storage/administración Auth.
 * SOLO se usa en el backend; jamás se expone al frontend.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  { auth: { persistSession: false, autoRefreshToken: false } }
);