import { Router } from 'express';

import { employeeController } from '../controllers/employee.controller';
import { employeeScheduleController } from '../controllers/employee-schedule.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import {
  createEmployeeSchema,
  deactivateEmployeeSchema,
  employeeListQuerySchema,
  updateEmployeeSchema,
} from '../validators/employee.schema';
import { idParamSchema } from '../validators/common';
import {
  assignScheduleSchema,
  employeeScheduleParamSchema,
} from '../validators/schedule.schema';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission('employees.read'),
  validate(employeeListQuerySchema),
  employeeController.list
);
router.get('/:id', requirePermission('employees.read'), validate(idParamSchema), employeeController.get);
router.post(
  '/',
  requirePermission('employees.write'),
  validate(createEmployeeSchema),
  employeeController.create
);
router.patch(
  '/:id',
  requirePermission('employees.write'),
  validate(idParamSchema),
  validate(updateEmployeeSchema),
  employeeController.update
);
router.delete(
  '/:id',
  requirePermission('employees.write'),
  validate(deactivateEmployeeSchema),
  employeeController.deactivate
);

// Asignación de horarios por empleado.
router.get(
  '/:employeeId/schedules',
  requirePermission('schedules.assign'),
  validate(employeeScheduleParamSchema),
  employeeScheduleController.list
);
router.post(
  '/:employeeId/schedules',
  requirePermission('schedules.assign'),
  validate(employeeScheduleParamSchema),
  validate(assignScheduleSchema),
  employeeScheduleController.assign
);
router.delete(
  '/:employeeId/schedules/:assignmentId',
  requirePermission('schedules.assign'),
  validate(employeeScheduleParamSchema),
  employeeScheduleController.deactivate
);

export default router;