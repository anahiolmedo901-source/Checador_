import { Router } from 'express';

import { scheduleController } from '../controllers/schedule.controller';
import { authenticate } from '../middleware/authenticate';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../validators/common';
import { createScheduleSchema, updateScheduleSchema } from '../validators/schedule.schema';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission('schedules.read'), scheduleController.list);
router.get('/:id', requirePermission('schedules.read'), validate(idParamSchema), scheduleController.get);
router.post(
  '/',
  requirePermission('schedules.write'),
  validate(createScheduleSchema),
  scheduleController.create
);
router.patch(
  '/:id',
  requirePermission('schedules.write'),
  validate(idParamSchema),
  validate(updateScheduleSchema),
  scheduleController.update
);

export default router;