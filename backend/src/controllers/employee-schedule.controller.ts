import { Request, Response } from 'express';

import { employeeScheduleService } from '../services/employee-schedule.service';
import { withAsync } from '../utils/async-handler';

const rawEmployeeScheduleController = {
  async list(req: Request, res: Response): Promise<void> {
    const { employeeId } = req.params as { employeeId: string };
    res.status(200).json({ success: true, data: await employeeScheduleService.list(employeeId) });
  },

  async assign(req: Request, res: Response): Promise<void> {
    const { employeeId } = req.params as { employeeId: string };
    const body = req.body as { schedule_id: string; effective_from?: string; effective_to?: string | null };
    res.status(201).json({ success: true, data: await employeeScheduleService.assign(employeeId, body) });
  },

  async deactivate(req: Request, res: Response): Promise<void> {
    const { employeeId, assignmentId } = req.params as { employeeId: string; assignmentId: string };
    res.status(200).json({ success: true, data: await employeeScheduleService.deactivate(employeeId, assignmentId) });
  },
};

export const employeeScheduleController = withAsync(rawEmployeeScheduleController);