import { Request, Response } from 'express';

import { branchService } from '../services/branch.service';
import { withAsync } from '../utils/async-handler';

const rawBranchController = {
  async list(_req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: await branchService.list() });
  },

  async get(req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: await branchService.get((req.params as { id: string }).id) });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as { name: string; address?: string | null; lat: number; lon: number; radius_m: number };
    res.status(201).json({ success: true, data: await branchService.create(body) });
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const patch = req.body as Record<string, unknown>;
    res.status(200).json({ success: true, data: await branchService.update(id, patch) });
  },

  async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    await branchService.remove(id);
    res.status(200).json({ success: true, data: { id } });
  },
};

export const branchController = withAsync(rawBranchController);