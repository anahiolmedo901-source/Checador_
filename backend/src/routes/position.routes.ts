import { Router } from 'express';

import { positionController } from '../controllers/position.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common';
import { createPositionSchema, updatePositionSchema } from '../validators/position.schema';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('positions.read'), positionController.list);
router.get('/:id', requirePermission('positions.read'), validate(idParamSchema), positionController.get);
router.post(
  '/',
  requirePermission('positions.write'),
  validate(createPositionSchema),
  positionController.create
);
router.patch(
  '/:id',
  requirePermission('positions.write'),
  validate(idParamSchema),
  validate(updatePositionSchema),
  positionController.update
);

export default router;