import { Request, Response } from 'express';

import { positionService } from '../services/position.service';
import { withAsync } from '../utils/async-handler';

const rawPositionController = {
  async list(req: Request, res: Response): Promise<void> {
    const { department_id } = req.query as { department_id?: string };
    res.status(200).json({ success: true, data: await positionService.list({ departmentId: department_id }) });
  },

  async get(req: Request, res: Response): Promise<void> {
    res
      .status(200)
      .json({ success: true, data: await positionService.get((req.params as { id: string }).id) });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as { title: string; code: string; department_id?: string | null };
    res.status(201).json({ success: true, data: await positionService.create(body) });
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const patch = req.body as Record<string, unknown>;
    res.status(200).json({ success: true, data: await positionService.update(id, patch) });
  },
};

export const positionController = withAsync(rawPositionController);