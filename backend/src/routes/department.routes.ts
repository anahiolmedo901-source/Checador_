import { Router } from 'express';

import { departmentController } from '../controllers/department.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common';
import { createDepartmentSchema, updateDepartmentSchema } from '../validators/department.schema';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('departments.read'), departmentController.list);
router.get('/:id', requirePermission('departments.read'), validate(idParamSchema), departmentController.get);
router.post(
  '/',
  requirePermission('departments.write'),
  validate(createDepartmentSchema),
  departmentController.create
);
router.patch(
  '/:id',
  requirePermission('departments.write'),
  validate(idParamSchema),
  validate(updateDepartmentSchema),
  departmentController.update
);

export default router;