import { supabaseAdmin } from '../config/supabase';
import { ScheduleRow } from '../types';
import { throwPostgrest } from '../utils/postgrest-error';

export const scheduleRepository = {
  async create(data: {
    name: string;
    code: string;
    check_in: string;
    check_out: string;
    tolerance_min: number;
    break_min: number;
  }): Promise<ScheduleRow> {
    const { data: row, error } = await supabaseAdmin
      .from('schedules')
      .insert(data)
      .select('*')
      .single();
    if (error) throwPostgrest(error);
    return row as ScheduleRow;
  },

  async update(id: string, patch: Partial<ScheduleRow>): Promise<ScheduleRow> {
    const { data, error } = await supabaseAdmin
      .from('schedules')
      .update(patch as never)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throwPostgrest(error);
    return data as ScheduleRow;
  },

  async findById(id: string): Promise<ScheduleRow | null> {
    const { data, error } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return data ?? null;
  },

  async list(): Promise<ScheduleRow[]> {
    const { data, error } = await supabaseAdmin
      .from('schedules')
      .select('*')
      .order('code', { ascending: true });
    if (error) throwPostgrest(error);
    return (data as ScheduleRow[]) ?? [];
  },
};