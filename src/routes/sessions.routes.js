import { Router } from 'express';
import { invalid } from '../utils/httpError.js';
import { ATTENDANCE_STATUSES, parseId } from '../utils/validators.js';

const MAX_RECORDS = 2000;

// One class and its register.
export function sessionRoutes({ courses, attendance }) {
  const router = Router();

  // Finds the class, then checks the user may open its course.
  async function loadSession(req) {
    const session = await attendance.findSession(parseId(req.params.id, 'Class'));
    const course = await courses.getFor(req.user, session.courseId);
    return { session, course };
  }

  router.get('/:id', async (req, res) => {
    const { session, course } = await loadSession(req);
    res.json({ session, course, register: await attendance.getRegister(session) });
  });

  router.put('/:id/attendance', async (req, res) => {
    const { session } = await loadSession(req);
    const records = req.body?.records;
    if (!Array.isArray(records) || records.length === 0) throw invalid({ records: 'Mark at least one student.' });
    if (records.length > MAX_RECORDS) throw invalid({ records: 'Too many marks in one save.' });
    const clean = records.map((record) => {
      const studentId = record?.studentId;
      const status = record?.status;
      if (!Number.isInteger(studentId) || studentId < 1 || !ATTENDANCE_STATUSES.includes(status)) {
        throw invalid({ records: 'One of the marks is not valid. Reload the register and try again.' });
      }
      return { studentId, status };
    });
    res.json(await attendance.saveRegister(session, clean, req.user.id));
  });

  router.delete('/:id', async (req, res) => {
    const { session } = await loadSession(req);
    await attendance.removeSession(session.id);
    res.status(204).end();
  });

  return router;
}
