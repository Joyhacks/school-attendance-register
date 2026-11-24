import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import session from 'express-session';

import { MySqlSessionStore } from './db/sessionStore.js';
import { requireAppHeader, requireAuth as buildRequireAuth, requireRole } from './middleware/auth.js';
import { apiNotFound, errorHandler } from './middleware/errorHandler.js';
import { authRoutes } from './routes/auth.routes.js';
import { courseRoutes } from './routes/courses.routes.js';
import { sessionRoutes } from './routes/sessions.routes.js';
import { studentRoutes } from './routes/students.routes.js';
import { userRoutes } from './routes/users.routes.js';
import { createAttendanceService } from './services/attendance.service.js';
import { createCourseService } from './services/courses.service.js';
import { createDashboardService } from './services/dashboard.service.js';
import { createStudentService } from './services/students.service.js';
import { createUserService } from './services/users.service.js';
import { rules, validate } from './utils/validators.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;

// Builds the Express app. Kept separate from server.js so tests can
// start the app against a test database.
export function createApp({ pool, config }) {
  const app = express();
  const sessionStore = new MySqlSessionStore(pool);

  const users = createUserService(pool);
  const students = createStudentService(pool);
  const courses = createCourseService(pool);
  const attendance = createAttendanceService(pool);
  const dashboard = createDashboardService(pool);
  const requireAuth = buildRequireAuth(users);

  app.disable('x-powered-by');
  if (config.isProduction) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          // Only force HTTPS on a real server. On localhost or a
          // classroom network the site runs on plain HTTP.
          upgradeInsecureRequests: config.isProduction ? [] : null,
        },
      },
      strictTransportSecurity: config.isProduction,
    }),
  );

  app.use(express.static(publicDir, { extensions: ['html'], maxAge: config.isProduction ? '1h' : 0 }));

  // Everything under /api
  const api = express.Router();
  api.use(rateLimit({ windowMs: 60 * 1000, limit: 1000, standardHeaders: true, legacyHeaders: false }));
  api.use(express.json({ limit: '200kb' }));
  api.use(
    session({
      name: 'attendance.sid',
      secret: config.sessionSecret,
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProduction, maxAge: EIGHT_HOURS_MS },
    }),
  );
  api.use(requireAppHeader);
  api.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  api.get('/meta', (req, res) => res.json({ schoolName: config.schoolName }));
  api.use('/auth', authRoutes({ users, requireAuth }));

  // From here on, a signed-in user is required.
  api.use(requireAuth);
  api.get('/dashboard', async (req, res) => {
    const { today } = validate({ today: req.query.today }, { today: rules.date({ label: 'Today' }) });
    res.json(await dashboard.summaryFor(req.user, today));
  });
  api.get('/lecturers', requireRole('admin'), async (req, res) => {
    // Short list for the "assign lecturer" dropdown.
    const all = await users.list();
    res.json({ lecturers: all.filter((u) => u.isActive).map((u) => ({ id: u.id, fullName: u.fullName, role: u.role })) });
  });
  api.use('/users', requireRole('admin'), userRoutes({ users }));
  api.use('/students', studentRoutes({ students, requireRole }));
  api.use('/courses', courseRoutes({ courses, attendance, requireRole }));
  api.use('/sessions', sessionRoutes({ courses, attendance }));
  api.use(apiNotFound);

  app.use('/api', api);
  app.use((req, res) => res.status(404).sendFile(path.join(publicDir, '404.html')));
  app.use(errorHandler);

  app.locals.close = () => sessionStore.close();
  return app;
}
