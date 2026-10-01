import { Request, Response } from 'express';

import { departmentService } from '../services/department.service';
import { withAsync } from '../utils/async-handler';

const rawDepartmentController = {
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: await departmentService.list() });
  },

  async get(req: Request, res: Response): Promise<void> {
    res
      .status(200)
      .json({ success: true, data: await departmentService.get((req.params as { id: string }).id) });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as { name: string; code: string };
    res.status(201).json({ success: true, data: await departmentService.create(body) });
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const patch = req.body as Record<string, unknown>;
    res.status(200).json({ success: true, data: await departmentService.update(id, patch) });
  },
};

export const departmentController = withAsync(rawDepartmentController);