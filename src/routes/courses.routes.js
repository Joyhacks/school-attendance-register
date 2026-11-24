import { Router } from 'express';
import { invalid } from '../utils/httpError.js';
import { toCsv } from '../utils/csv.js';
import { parseId, rules, validate } from '../utils/validators.js';

const MAX_ENROLL = 1000;

export function courseRoutes({ courses, attendance, requireRole }) {
  const router = Router();
  const adminOnly = requireRole('admin');

  const courseSchema = {
    code: rules.text({ min: 2, max: 20, label: 'Course code' }),
    title: rules.text({ min: 2, max: 150, label: 'Course title' }),
    lecturerId: rules.optionalId({ label: 'Lecturer' }),
    minAttendance: rules.integer({ min: 0, max: 100, label: 'Minimum attendance' }),
  };

  router.get('/', async (req, res) => {
    res.json({ courses: await courses.listFor(req.user) });
  });

  router.post('/', adminOnly, async (req, res) => {
    const input = validate(req.body, courseSchema);
    input.code = input.code.toUpperCase();
    res.status(201).json({ course: await courses.create(req.user, input) });
  });

  // getFor() is the permission check: admins pass, lecturers only
  // pass for their own course. Every route below calls it first.
  router.get('/:id', async (req, res) => {
    res.json({ course: await courses.getFor(req.user, parseId(req.params.id, 'Course')) });
  });

  router.patch('/:id', adminOnly, async (req, res) => {
    const changes = validate(req.body, courseSchema, { partial: true });
    if (changes.code) changes.code = changes.code.toUpperCase();
    res.json({ course: await courses.update(req.user, parseId(req.params.id, 'Course'), changes) });
  });

  router.delete('/:id', adminOnly, async (req, res) => {
    await courses.remove(parseId(req.params.id, 'Course'));
    res.status(204).end();
  });

  // Students in the course
  router.get('/:id/students', async (req, res) => {
    const course = await courses.getFor(req.user, parseId(req.params.id, 'Course'));
    res.json({ students: await courses.listStudents(course.id) });
  });

  router.post('/:id/students', async (req, res) => {
    const course = await courses.getFor(req.user, parseId(req.params.id, 'Course'));
    const body = req.body || {};
    if (Array.isArray(body.studentIds)) {
      const ids = [...new Set(body.studentIds)];
      if (ids.length === 0 || ids.length > MAX_ENROLL || !ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw invalid({ studentIds: `Pick between 1 and ${MAX_ENROLL} students.` });
      }
      return res.status(201).json(await courses.enrollByIds(course.id, ids));
    }
    const group = validate(body, {
      department: rules.text({ max: 100, label: 'Department' }),
      level: rules.text({ max: 30, label: 'Level' }),
    });
    res.status(201).json(await courses.enrollByGroup(course.id, group));
  });

  router.delete('/:id/students/:studentId', async (req, res) => {
    const course = await courses.getFor(req.user, parseId(req.params.id, 'Course'));
    await courses.unenroll(course.id, parseId(req.params.studentId, 'Student'));
    res.status(204).end();
  });

  // Classes held
  router.get('/:id/sessions', async (req, res) => {
    const course = await courses.getFor(req.user, parseId(req.params.id, 'Course'));
    res.json({ sessions: await attendance.listSessions(course.id) });
  });

  router.post('/:id/sessions', async (req, res) => {
    const course = await courses.getFor(req.user, parseId(req.params.id, 'Course'));
    const input = validate(req.body, {
      date: rules.date(),
      period: rules.integer({ min: 1, max: 10, label: 'Class period' }),
      topic: rules.optionalText({ max: 200, label: 'Topic' }),
    });
    res.status(201).json({ session: await attendance.createSession(course.id, input, req.user.id) });
  });

  // Attendance report, as JSON or as a CSV download (?format=csv)
  router.get('/:id/report', async (req, res) => {
    const course = await courses.getFor(req.user, parseId(req.params.id, 'Course'));
    const report = await attendance.courseReport(course);
    if (req.query.format !== 'csv') return res.json({ course, report });

    const standingLabel = { ok: 'Meets minimum', at_risk: `Below ${course.minAttendance}%`, no_data: 'No classes yet' };
    const csv = toCsv(
      ['Matric number', 'Full name', 'Department', 'Level', 'Classes held', 'Present', 'Late', 'Absent', 'Excused', 'Attendance %', 'Standing'],
      report.students.map((s) => [
        s.matricNo, s.fullName, s.department, s.level, report.sessionsHeld,
        s.present, s.late, s.absent, s.excused, s.percent ?? '', standingLabel[s.standing],
      ]),
    );
    const fileName = `${course.code.replace(/[^A-Za-z0-9]+/g, '-')}-attendance.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  });

  return router;
}
