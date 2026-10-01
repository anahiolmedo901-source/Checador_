import { employeeRepository } from '../repositories/employee.repository';
import { branchRepository } from '../repositories/branch.repository';
import { departmentRepository } from '../repositories/department.repository';
import { positionRepository } from '../repositories/position.repository';
import { EmployeeWithRelations } from '../types';
import { HTTPError } from '../utils/http-error';
import { buildPagination, PageResult } from '../utils/pagination';
import { authService } from './auth.service';

interface CreateEmployeeInput {
  code: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string | null;
  hire_date?: string | null;
  password: string;
  branch_id?: string | null;
  department_id?: string | null;
  position_id?: string | null;
}

function composeFullName(input: Partial<CreateEmployeeInput>): string {
  if (input.full_name?.trim()) return input.full_name.trim();
  return [input.first_name, input.last_name].filter(Boolean).join(' ').trim();
}

async function validateForeignKeys(input: {
  branch_id?: string | null;
  department_id?: string | null;
  position_id?: string | null;
}): Promise<void> {
  if (input.branch_id) {
    const branch = await branchRepository.findById(input.branch_id);
    if (!branch) throw HTTPError.badRequest('La sucursal no existe.');
  }
  if (input.department_id) {
    const department = await departmentRepository.findById(input.department_id);
    if (!department) throw HTTPError.badRequest('El departamento no existe.');
  }
  if (input.position_id) {
    const position = await positionRepository.findById(input.position_id);
    if (!position) throw HTTPError.badRequest('El puesto no existe.');
  }
}

export const employeeService = {
  async list(query: {
    page?: number;
    limit?: number;
    search?: string;
    departmentId?: string;
    active?: string;
  }): Promise<PageResult<EmployeeWithRelations>> {
    const pagination = buildPagination(query.page, query.limit);
    const { data, total } = await employeeRepository.list(
      {
        search: query.search,
        departmentId: query.departmentId,
        active: query.active === undefined ? undefined : query.active === 'true',
      },
      pagination.offset,
      pagination.limit
    );
    return { data, page: pagination.page, limit: pagination.limit, total, hasMore: false };
  },

  async get(id: string): Promise<EmployeeWithRelations> {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw HTTPError.notFound('Empleado no encontrado.');
    return employee;
  },

  async create(input: CreateEmployeeInput): Promise<EmployeeWithRelations> {
    await validateForeignKeys(input);
    const full_name = composeFullName(input);
    return authService.createUser({ ...input, role: 'employee', full_name });
  },

  async update(
    id: string,
    patch: {
      full_name?: string;
      first_name?: string | null;
      last_name?: string | null;
      phone?: string | null;
      hire_date?: string | null;
      branch_id?: string | null;
      department_id?: string | null;
      position_id?: string | null;
      active?: boolean;
    }
  ): Promise<EmployeeWithRelations> {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw HTTPError.notFound('Empleado no encontrado.');

    await validateForeignKeys({
      branch_id: patch.branch_id,
      department_id: patch.department_id,
      position_id: patch.position_id,
    });

    const next: Partial<typeof employee> = {};
    const resolvedName = composeFullName(patch as CreateEmployeeInput);
    if (resolvedName) next.full_name = resolvedName;
    if (patch.first_name !== undefined) next.first_name = patch.first_name;
    if (patch.last_name !== undefined) next.last_name = patch.last_name;
    if (patch.phone !== undefined) next.phone = patch.phone;
    if (patch.hire_date !== undefined) next.hire_date = patch.hire_date;
    if (patch.branch_id !== undefined) next.branch_id = patch.branch_id;
    if (patch.department_id !== undefined) next.department_id = patch.department_id;
    if (patch.position_id !== undefined) next.position_id = patch.position_id;
    if (patch.active !== undefined) next.active = patch.active;

    return employeeRepository.update(id, next);
  },

  /** Desactivación (soft delete). El usuario no puede iniciar sesión. */
  async deactivate(id: string): Promise<EmployeeWithRelations> {
    const employee = await employeeRepository.findById(id);
    if (!employee) throw HTTPError.notFound('Empleado no encontrado.');
    if (!employee.active) throw HTTPError.conflict('El empleado ya está inactivo.');
    return employeeRepository.update(id, { active: false });
  },
};