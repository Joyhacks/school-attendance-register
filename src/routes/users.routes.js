import { Router } from 'express';
import { ROLES, parseId, rules, validate } from '../utils/validators.js';

// Staff accounts. Admin only (the role check is applied where this router is mounted).
export function userRoutes({ users }) {
  const router = Router();

  const profileSchema = {
    fullName: rules.text({ min: 2, max: 120, label: 'Full name' }),
    email: rules.email(),
    role: rules.oneOf(ROLES, { label: 'Role' }),
  };

  router.get('/', async (req, res) => {
    res.json({ users: await users.list() });
  });

  router.post('/', async (req, res) => {
    const input = validate(req.body, { ...profileSchema, password: rules.password() });
    res.status(201).json({ user: await users.create(input) });
  });

  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id, 'User');
    const changes = validate(req.body, { ...profileSchema, isActive: rules.boolean({ label: 'Active' }) }, { partial: true });
    const user = await users.update(id, changes, req.user);
    if (changes.isActive === false) await users.endSessionsFor(id);
    res.json({ user });
  });

  router.post('/:id/reset-password', async (req, res) => {
    const id = parseId(req.params.id, 'User');
    const { newPassword } = validate(req.body, { newPassword: rules.password({ label: 'New password' }) });
    await users.setPassword(id, newPassword);
    await users.endSessionsFor(id, id === req.user.id ? req.sessionID : null);
    res.status(204).end();
  });

  return router;
}
