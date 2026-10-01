import { departmentRepository } from '../repositories/department.repository';
import { DepartmentRow } from '../types';
import { HTTPError } from '../utils/http-error';

export const departmentService = {
  async list(): Promise<DepartmentRow[]> {
    return departmentRepository.list();
  },

  async get(id: string): Promise<DepartmentRow> {
    const row = await departmentRepository.findById(id);
    if (!row) throw HTTPError.notFound('Departamento no encontrado.');
    return row;
  },

  async create(input: { name: string; code: string }): Promise<DepartmentRow> {
    return departmentRepository.create(input);
  },

  async update(id: string, patch: Partial<DepartmentRow>): Promise<DepartmentRow> {
    await this.get(id);
    return departmentRepository.update(id, patch);
  },
};