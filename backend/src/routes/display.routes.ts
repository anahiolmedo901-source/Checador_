import { Router } from 'express';

import { pair, register, snapshot } from '../controllers/display.controller';
import { jsonLimiter } from '../middleware/rate-limit';

const router = Router();

const registerLimiter = jsonLimiter(60_000, 20);

router.post('/register', registerLimiter, register);
router.post('/pair', registerLimiter, pair);
router.get('/snapshot', snapshot);

export default router;
