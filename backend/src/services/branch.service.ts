import { branchRepository } from '../repositories/branch.repository';
import { BranchRow } from '../types';
import { HTTPError } from '../utils/http-error';

export const branchService = {
  async list(): Promise<BranchRow[]> {
    return branchRepository.list();
  },

  async get(id: string): Promise<BranchRow> {
    const row = await branchRepository.findById(id);
    if (!row) throw HTTPError.notFound('Sucursal no encontrada.');
    return row;
  },

  async create(input: {
    name: string;
    address?: string | null;
    lat: number;
    lon: number;
    radius_m: number;
  }): Promise<BranchRow> {
    return branchRepository.create(input);
  },

  async update(id: string, patch: Partial<BranchRow>): Promise<BranchRow> {
    await this.get(id);
    return branchRepository.update(id, patch);
  },

  async remove(id: string): Promise<void> {
    await this.get(id);
    const refs = await branchRepository.countReferences(id);
    const usedBy: string[] = [];
    if (refs.employees > 0) usedBy.push(`${refs.employees} empleado(s)`);
    if (refs.displays > 0) usedBy.push(`${refs.displays} pantalla(s)`);
    if (refs.attendance > 0) usedBy.push(`${refs.attendance} registro(s) de asistencia`);
    if (usedBy.length > 0) {
      throw HTTPError.conflict(
        `No se puede eliminar la sucursal: está en uso por ${usedBy.join(', ')}. Desactívala en lugar de eliminarla.`
      );
    }
    await branchRepository.remove(id);
  },
};