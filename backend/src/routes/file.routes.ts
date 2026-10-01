import { Router } from 'express';

import { fileController } from '../controllers/file.controller';
import { authenticate } from '../middleware/authenticate';
import { requireAnyPermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { signedUrlSchema } from '../validators/file.schema';

const router = Router();

router.use(authenticate);

router.post(
  '/signed-url',
  requireAnyPermission(['files.read', 'files.attendance.self']),
  validate(signedUrlSchema),
  fileController.createSignedUrl
);

export default router;