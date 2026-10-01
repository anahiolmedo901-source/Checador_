import { scheduleRepository } from '../repositories/schedule.repository';
import { ScheduleRow } from '../types';
import { HTTPError } from '../utils/http-error';

export const scheduleService = {
  async list(): Promise<ScheduleRow[]> {
    return scheduleRepository.list();
  },

  async get(id: string): Promise<ScheduleRow> {
    const row = await scheduleRepository.findById(id);
    if (!row) throw HTTPError.notFound('Horario no encontrado.');
    return row;
  },

  async create(input: {
    name: string;
    code: string;
    check_in: string;
    check_out: string;
    tolerance_min: number;
    break_min: number;
  }): Promise<ScheduleRow> {
    return scheduleRepository.create(input);
  },

  async update(id: string, patch: Partial<ScheduleRow>): Promise<ScheduleRow> {
    const current = await this.get(id);
    const checkIn = patch.check_in ?? current.check_in;
    const checkOut = patch.check_out ?? current.check_out;
    if (checkOut <= checkIn) {
      throw HTTPError.badRequest('La salida debe ser posterior a la entrada. Los turnos nocturnos requieren configuración aparte.');
    }
    return scheduleRepository.update(id, patch);
  },
};
