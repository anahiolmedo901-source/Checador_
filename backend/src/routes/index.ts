import { Router } from 'express';

import { healthCheck, healthDetailed } from '../controllers/health.controller';
import authRoutes from './auth.routes';
import employeeRoutes from './employee.routes';
import departmentRoutes from './department.routes';
import positionRoutes from './position.routes';
import branchRoutes from './branch.routes';
import scheduleRoutes from './schedule.routes';
import fileRoutes from './file.routes';
import displayRoutes from './display.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.get('/health', healthCheck);
router.get('/health/detailed', healthDetailed);
router.use('/auth', authRoutes);
router.use('/employees', employeeRoutes);
router.use('/departments', departmentRoutes);
router.use('/positions', positionRoutes);
router.use('/branches', branchRoutes);
router.use('/schedules', scheduleRoutes);
router.use('/files', fileRoutes);
router.use('/displays', displayRoutes);
router.use('/admin', adminRoutes);

export default router;