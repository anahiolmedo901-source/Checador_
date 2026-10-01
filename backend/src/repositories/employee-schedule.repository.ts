import { supabaseAdmin } from '../config/supabase';
import { EmployeeScheduleRow } from '../types';
import { HTTPError } from '../utils/http-error';
import { throwPostgrest } from '../utils/postgrest-error';

const SELECT = `id, employee_id, schedule_id, effective_from, effective_to, active, created_at, schedules(id, name, code, check_in, check_out, tolerance_min, break_min)`;

interface AssignmentInput {
  employee_id: string;
  schedule_id: string;
  effective_from?: string;
  effective_to?: string | null;
}

export const employeeScheduleRepository = {
  async create(input: AssignmentInput): Promise<EmployeeScheduleRow> {
    const { data, error } = await supabaseAdmin
      .from('employee_schedules')
      .insert({
        employee_id: input.employee_id,
        schedule_id: input.schedule_id,
        effective_from: input.effective_from ?? new Date().toISOString(),
        effective_to: input.effective_to ?? null,
        active: true,
      })
      .select(SELECT)
      .single();
    if (error) throwPostgrest(error);
    return data as EmployeeScheduleRow;
  },

  /** Asignación vigente que se traslapa con [from, to]. */
  async findOverlapping(
    employeeId: string,
    from: string,
    to: string | null
  ): Promise<EmployeeScheduleRow | null> {
    const { data, error } = await supabaseAdmin
      .from('employee_schedules')
      .select(SELECT)
      .eq('employee_id', employeeId)
      .eq('active', true)
      .lte('effective_from', to ?? '9999-12-31T23:59:59.999Z')
      .or(`effective_to.is.null,effective_to.gte.${from}`)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return data ?? null;
  },

  async listByEmployee(employeeId: string): Promise<EmployeeScheduleRow[]> {
    const { data, error } = await supabaseAdmin
      .from('employee_schedules')
      .select(SELECT)
      .eq('employee_id', employeeId)
      .order('effective_from', { ascending: false });
    if (error) throwPostgrest(error);
    return (data as EmployeeScheduleRow[]) ?? [];
  },

  async findById(id: string): Promise<EmployeeScheduleRow | null> {
    const { data, error } = await supabaseAdmin
      .from('employee_schedules')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return data ?? null;
  },

  async deactivate(id: string): Promise<EmployeeScheduleRow> {
    const { data, error } = await supabaseAdmin
      .from('employee_schedules')
      .update({ active: false })
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throwPostgrest(error);
    return data as EmployeeScheduleRow;
  },
};

export function requireAssignment(id: string): Promise<EmployeeScheduleRow> {
  return employeeScheduleRepository.findById(id).then((row) => {
    if (!row) throw HTTPError.notFound('Asignación de horario no encontrada.');
    return row;
  });
}