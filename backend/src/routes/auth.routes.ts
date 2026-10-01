import { Router } from 'express';

import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { loginRateLimit } from '../middleware/rate-limit';
import { requirePermission } from '../middleware/authorize';
import { validate } from '../middleware/validate';
import { loginSchema, createUserSchema, updateUserSchema } from '../validators/auth.schema';

const router = Router();

router.post('/login', loginRateLimit, validate(loginSchema), authController.login);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

// Gestión de usuarios (crear administrador/HR manualmente desde la API).
router.post(
  '/users',
  authenticate,
  requirePermission('employees.write'),
  validate(createUserSchema),
  authController.createUser
);
router.patch(
  '/users/:id',
  authenticate,
  requirePermission('employees.write'),
  validate(updateUserSchema),
  authController.updateUser
);

export default router;