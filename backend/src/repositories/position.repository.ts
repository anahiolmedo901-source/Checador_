import { supabaseAdmin } from '../config/supabase';
import { PositionRow } from '../types';
import { throwPostgrest } from '../utils/postgrest-error';

const SELECT = `id, department_id, title, code, active, created_at, departments(id, name)`;

export const positionRepository = {
  async create(data: {
    title: string;
    code: string;
    department_id?: string | null;
  }): Promise<PositionRow> {
    const { data: row, error } = await supabaseAdmin
      .from('positions')
      .insert({
        title: data.title,
        code: data.code,
        department_id: data.department_id ?? null,
      } as never)
      .select(SELECT)
      .single();
    if (error) throwPostgrest(error);
    return row as PositionRow;
  },

  async update(id: string, patch: Partial<PositionRow>): Promise<PositionRow> {
    const { data, error } = await supabaseAdmin
      .from('positions')
      .update(patch as never)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throwPostgrest(error);
    return data as PositionRow;
  },

  async findById(id: string): Promise<PositionRow | null> {
    const { data, error } = await supabaseAdmin
      .from('positions')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return data ?? null;
  },

  async list(filters: { departmentId?: string }): Promise<PositionRow[]> {
    let query = supabaseAdmin.from('positions').select(SELECT);
    if (filters.departmentId) query = query.eq('department_id', filters.departmentId);
    const { data, error } = await query.order('title', { ascending: true });
    if (error) throwPostgrest(error);
    return (data as PositionRow[]) ?? [];
  },
};