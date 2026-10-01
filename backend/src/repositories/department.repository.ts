import { supabaseAdmin } from '../config/supabase';
import { DepartmentRow } from '../types';
import { throwPostgrest } from '../utils/postgrest-error';

export const departmentRepository = {
  async create(data: { name: string; code: string }): Promise<DepartmentRow> {
    const { data: row, error } = await supabaseAdmin
      .from('departments')
      .insert(data)
      .select('*')
      .single();
    if (error) throwPostgrest(error);
    return row as DepartmentRow;
  },

  async update(id: string, patch: Partial<DepartmentRow>): Promise<DepartmentRow> {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .update(patch as never)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throwPostgrest(error);
    return data as DepartmentRow;
  },

  async findById(id: string): Promise<DepartmentRow | null> {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return data ?? null;
  },

  async list(): Promise<DepartmentRow[]> {
    const { data, error } = await supabaseAdmin
      .from('departments')
      .select('*')
      .order('name', { ascending: true });
    if (error) throwPostgrest(error);
    return (data as DepartmentRow[]) ?? [];
  },
};