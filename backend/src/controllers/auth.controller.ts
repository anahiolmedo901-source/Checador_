import { Request, Response } from 'express';

import { authService } from '../services/auth.service';
import { withAsync } from '../utils/async-handler';

const rawAuthController = {
  async login(req: Request, res: Response): Promise<void> {
    const { email, password } = req.body as { email: string; password: string };
    const session = await authService.login(email, password);
    res.status(200).json({ success: true, data: session });
  },

  async me(req: Request, res: Response): Promise<void> {
    res.status(200).json({ success: true, data: req.user });
  },

  async logout(_req: Request, res: Response): Promise<void> {
    const result = await authService.logout();
    res.status(200).json({ success: true, data: result });
  },

  async createUser(req: Request, res: Response): Promise<void> {
    const body = req.body as {
      code: string;
      full_name: string;
      password: string;
      role: string;
      branch_id?: string | null;
      department_id?: string | null;
      position_id?: string | null;
    };
    const employee = await authService.createUser(body, req.user?.role);
    res.status(201).json({ success: true, data: employee });
  },

  async updateUser(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const body = req.body as { password?: string; role?: string };
    const employee = await authService.updateUser(id, body, req.user?.role);
    res.status(200).json({ success: true, data: employee });
  },
};

export const authController = withAsync(rawAuthController);