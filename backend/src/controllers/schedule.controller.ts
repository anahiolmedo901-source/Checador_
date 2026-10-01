import { Request, Response } from 'express';

import { scheduleService } from '../services/schedule.service';
import { withAsync } from '../utils/async-handler';

const rawScheduleController = {
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: await scheduleService.list() });
  },

  async get(req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: await scheduleService.get((req.params as { id: string }).id) });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as {
      name: string;
      code: string;
      check_in: string;
      check_out: string;
      tolerance_min: number;
      break_min: number;
    };
    res.status(201).json({ success: true, data: await scheduleService.create(body) });
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const patch = req.body as Record<string, unknown>;
    res.status(200).json({ success: true, data: await scheduleService.update(id, patch) });
  },
};

export const scheduleController = withAsync(rawScheduleController);