import { positionRepository } from '../repositories/position.repository';
import { departmentRepository } from '../repositories/department.repository';
import { PositionRow } from '../types';
import { HTTPError } from '../utils/http-error';

export const positionService = {
  async list(query: { departmentId?: string }): Promise<PositionRow[]> {
    return positionRepository.list({ departmentId: query.departmentId });
  },

  async get(id: string): Promise<PositionRow> {
    const row = await positionRepository.findById(id);
    if (!row) throw HTTPError.notFound('Puesto no encontrado.');
    return row;
  },

  async create(input: {
    title: string;
    code: string;
    department_id?: string | null;
  }): Promise<PositionRow> {
    if (input.department_id) {
      const department = await departmentRepository.findById(input.department_id);
      if (!department) throw HTTPError.badRequest('El departamento no existe.');
    }
    return positionRepository.create(input);
  },

  async update(
    id: string,
    patch: { title?: string; code?: string; department_id?: string | null; active?: boolean }
  ): Promise<PositionRow> {
    await this.get(id);
    if (patch.department_id) {
      const department = await departmentRepository.findById(patch.department_id);
      if (!department) throw HTTPError.badRequest('El departamento no existe.');
    }
    return positionRepository.update(id, patch);
  },
};