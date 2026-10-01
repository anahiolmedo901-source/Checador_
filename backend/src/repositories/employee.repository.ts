import { supabaseAdmin } from '../config/supabase';
import { EmployeeRow, EmployeeWithRelations } from '../types';
import { HTTPError } from '../utils/http-error';
import { throwPostgrest } from '../utils/postgrest-error';

const SELECT = `id, code, full_name, first_name, last_name, phone, hire_date, photo_url, branch_id, department_id, position_id, role, active, created_at, branches(id, name), departments(id, name), positions(id, title)`;

interface EmployeeListFilters {
  search?: string;
  departmentId?: string;
  active?: boolean;
}

export const employeeRepository = {
  async create(payload: {
    id: string;
    code: string;
    full_name: string;
    first_name?: string | null;
    last_name?: string | null;
    phone?: string | null;
    hire_date?: string | null;
    branch_id?: string | null;
    department_id?: string | null;
    position_id?: string | null;
    role: string;
  }): Promise<EmployeeWithRelations> {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .insert({
        id: payload.id,
        code: payload.code,
        full_name: payload.full_name,
        first_name: payload.first_name ?? null,
        last_name: payload.last_name ?? null,
        phone: payload.phone ?? null,
        hire_date: payload.hire_date ?? null,
        branch_id: payload.branch_id ?? null,
        department_id: payload.department_id ?? null,
        position_id: payload.position_id ?? null,
        role: payload.role as never,
      })
      .select(SELECT)
      .single();
    if (error) throwPostgrest(error);
    return data as unknown as EmployeeWithRelations;
  },

  async update(id: string, patch: Partial<EmployeeRow>): Promise<EmployeeWithRelations> {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .update(patch as never)
      .eq('id', id)
      .select(SELECT)
      .single();
    if (error) throwPostgrest(error);
    return data as unknown as EmployeeWithRelations;
  },

  async findById(id: string): Promise<EmployeeWithRelations | null> {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select(SELECT)
      .eq('id', id)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return (data as unknown as EmployeeWithRelations) ?? null;
  },

  async findByCode(code: string): Promise<{ id: string } | null> {
    const { data, error } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (error) throwPostgrest(error);
    return data ?? null;
  },

  async list(
    filters: EmployeeListFilters,
    offset: number,
    limit: number
  ): Promise<{ data: EmployeeWithRelations[]; total: number }> {
    let query = supabaseAdmin
      .from('employees')
      .select(SELECT, { count: 'exact' });

    if (filters.search) {
      const term = filters.search.trim().replace(/%/g, '\\%');
      query = query.or(`code.ilike.%${term}%,full_name.ilike.%${term}%`);
    }
    if (filters.departmentId) {
      query = query.eq('department_id', filters.departmentId);
    }
    if (filters.active !== undefined) {
      query = query.eq('active', filters.active);
    }

    const { data, error, count } = await query
      .order('code', { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throwPostgrest(error);
    return { data: (data as unknown as EmployeeWithRelations[]) ?? [], total: count ?? 0 };
  },
};

export function requireEmployee(id: string): Promise<EmployeeWithRelations> {
  return employeeRepository.findById(id).then((row) => {
    if (!row) throw HTTPError.notFound('Empleado no encontrado.');
    return row;
  });
}
