import {
  employeeScheduleRepository,
  requireAssignment,
} from '../repositories/employee-schedule.repository';
import { scheduleRepository } from '../repositories/schedule.repository';
import { requireEmployee } from '../repositories/employee.repository';
import { EmployeeScheduleRow } from '../types';
import { HTTPError } from '../utils/http-error';

export const employeeScheduleService = {
  async list(employeeId: string): Promise<EmployeeScheduleRow[]> {
    await requireEmployee(employeeId);
    return employeeScheduleRepository.listByEmployee(employeeId);
  },

  async assign(
    employeeId: string,
    input: {
      schedule_id: string;
      effective_from?: string;
      effective_to?: string | null;
    }
  ): Promise<EmployeeScheduleRow> {
    await requireEmployee(employeeId);

    const schedule = await scheduleRepository.findById(input.schedule_id);
    if (!schedule) throw HTTPError.badRequest('El horario no existe.');
    if (!schedule.active) throw HTTPError.badRequest('El horario está inactivo.');

    const from = input.effective_from ?? new Date().toISOString();
    const to = input.effective_to ?? null;

    const overlap = await employeeScheduleRepository.findOverlapping(employeeId, from, to);
    if (overlap) {
      throw HTTPError.conflict('El empleado ya tiene una asignación vigente en ese rango.');
    }

    return employeeScheduleRepository.create({
      employee_id: employeeId,
      schedule_id: input.schedule_id,
      effective_from: from,
      effective_to: to,
    });
  },

  async deactivate(employeeId: string, assignmentId: string): Promise<EmployeeScheduleRow> {
    await requireEmployee(employeeId);
    const assignment = await requireAssignment(assignmentId);
    if (assignment.employee_id !== employeeId) {
      throw HTTPError.notFound('La asignación no pertenece a este empleado.');
    }
    if (!assignment.active) {
      throw HTTPError.conflict('La asignación ya está inactiva.');
    }
    return employeeScheduleRepository.deactivate(assignmentId);
  },
};