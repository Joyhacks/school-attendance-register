import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { rules, validate } from '../utils/validators.js';

export function setupRoutes({ setup }) {
  const router = Router();

  // Slows down anyone trying to guess the setup code.
  const setupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'too_many_requests', message: 'Too many tries. Wait 15 minutes and try again.' } },
  });

  router.get('/status', async (req, res) => {
    res.json({ needsSetup: await setup.needsSetup() });
  });

  router.post('/', setupLimiter, async (req, res) => {
    const input = validate(req.body, {
      setupCode: rules.text({ min: 9, max: 9, label: 'Setup code' }),
      fullName: rules.text({ min: 2, max: 120, label: 'Full name' }),
      email: rules.email(),
      password: rules.password(),
      demoData: rules.boolean({ label: 'Demo data' }),
    });
    res.status(201).json(await setup.complete(input));
  });

  return router;
}
