import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { rules, validate } from '../utils/validators.js';

export function authRoutes({ users, requireAuth }) {
  const router = Router();

  // Twenty failed sign-ins per 15 minutes per network address. Slows
  // down password guessing. Successful sign-ins are not counted, so a
  // staff room sharing one connection is not locked out.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'too_many_requests', message: 'Too many sign-in attempts. Wait 15 minutes and try again.' } },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { email, password } = validate(req.body, {
      email: rules.email(),
      password: rules.text({ max: 200, label: 'Password' }),
    });
    const user = await users.verifyLogin(email, password);
    // A fresh session id on sign-in, so an id planted before login is useless.
    await new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
    req.session.userId = user.id;
    await new Promise((resolve, reject) => req.session.save((err) => (err ? reject(err) : resolve())));
    res.json({ user });
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('attendance.sid');
      res.status(204).end();
    });
  });

  // Used by the sign-in page to skip the form when already signed in.
  // Always answers 200, so a signed-out visitor sees no error.
  router.get('/status', async (req, res) => {
    const user = req.session?.userId ? await users.findActiveById(req.session.userId) : null;
    res.json({ signedIn: Boolean(user) });
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: req.user });
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = validate(req.body, {
      currentPassword: rules.text({ max: 200, label: 'Current password' }),
      newPassword: rules.password({ label: 'New password' }),
    });
    await users.changeOwnPassword(req.user.id, currentPassword, newPassword);
    await users.endSessionsFor(req.user.id, req.sessionID);
    res.status(204).end();
  });

  return router;
}
