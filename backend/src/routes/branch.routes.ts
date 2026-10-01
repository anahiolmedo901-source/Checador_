import { Router } from 'express';

import { branchController } from '../controllers/branch.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common';
import { createBranchSchema, updateBranchSchema } from '../validators/branch.schema';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('branches.read'), branchController.list);
router.get('/:id', requirePermission('branches.read'), validate(idParamSchema), branchController.get);
router.post(
  '/',
  requirePermission('branches.write'),
  validate(createBranchSchema),
  branchController.create
);
router.patch(
  '/:id',
  requirePermission('branches.write'),
  validate(idParamSchema),
  validate(updateBranchSchema),
  branchController.update
);
router.delete(
  '/:id',
  requirePermission('branches.write'),
  validate(idParamSchema),
  branchController.remove
);

export default router;
