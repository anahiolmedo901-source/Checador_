import { supabaseAdmin } from '../config/supabase';
import { BranchRow } from '../types';
import { throwPostgrest } from '../utils/postgrest-error';

export const branchRepository = {
  async create(data: {
    name: string;
    address?: string | null;
    lat: number;
    lon: number;
    radius_m: number;
  }): Promise<BranchRow> {
    const { data: row, error } = await supabaseAdmin
      .from('branches')
      .insert({
        name: data.name,
        address: data.address ?? null,
        lat: data.lat,
        lon: data.lon,
        radius_m: data.radius_m,
      })
      .select('*')
      .single();
    if (error) throwPostgrest(error);
    return row as BranchRow;
  },

  async update(id: string, patch: Partial<BranchRow>): Promise<BranchRow> {
    const { data, error } = await supabaseAdmin
      .from('branches')
      .update(patch as never)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throwPostgrest(error);
    return data as BranchRow;
  },

  async findById(id: string): Promise<BranchRow | null> {
    const { data, error } = await supabaseAdmin
      .from('branches')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return data ?? null;
  },

  async list(): Promise<BranchRow[]> {
    const { data, error } = await supabaseAdmin
      .from('branches')
      .select('*')
      .order('name', { ascending: true });
    if (error) throwPostgrest(error);
    return (data as BranchRow[]) ?? [];
  },

  async countReferences(id: string): Promise<{ employees: number; displays: number; attendance: number }> {
    const employees = await supabaseAdmin
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', id);
    const displays = await supabaseAdmin
      .from('displays')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', id);
    const attendance = await supabaseAdmin
      .from('attendance')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', id);
    for (const r of [employees, displays, attendance]) if (r.error) throwPostgrest(r.error);
    return {
      employees: employees.count ?? 0,
      displays: displays.count ?? 0,
      attendance: attendance.count ?? 0,
    };
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabaseAdmin.from('branches').delete().eq('id', id);
    if (error) throwPostgrest(error);
  },
};