import { Request, Response } from 'express';

import { employeeService } from '../services/employee.service';
import { withAsync } from '../utils/async-handler';

const rawEmployeeController = {
  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as Record<string, string | undefined>;
    const result = await employeeService.list({
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      search: query.search,
      departmentId: query.department_id,
      active: query.active,
    });
    res.status(200).json({ success: true, data: result });
  },

  async get(req: Request, res: Response): Promise<void> {
    const employee = await employeeService.get((req.params as { id: string }).id);
    res.status(200).json({ success: true, data: employee });
  },

  async create(req: Request, res: Response): Promise<void> {
    const body = req.body as Parameters<typeof employeeService.create>[0];
    const employee = await employeeService.create(body);
    res.status(201).json({ success: true, data: employee });
  },

  async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params as { id: string };
    const body = req.body as Parameters<typeof employeeService.update>[1];
    const employee = await employeeService.update(id, body);
    res.status(200).json({ success: true, data: employee });
  },

  async deactivate(req: Request, res: Response): Promise<void> {
    const employee = await employeeService.deactivate((req.params as { id: string }).id);
    res.status(200).json({ success: true, data: employee });
  },
};

export const employeeController = withAsync(rawEmployeeController);