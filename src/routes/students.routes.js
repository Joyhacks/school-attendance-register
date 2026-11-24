import { Router } from 'express';
import { HttpError, invalid } from '../utils/httpError.js';
import { parseId, rules, validate } from '../utils/validators.js';

const MAX_IMPORT = 500;

export function studentRoutes({ students, requireRole }) {
  const router = Router();
  const adminOnly = requireRole('admin');

  const studentSchema = {
    matricNo: rules.text({ min: 2, max: 40, label: 'Matric number' }),
    fullName: rules.text({ min: 2, max: 120, label: 'Full name' }),
    department: rules.text({ min: 2, max: 100, label: 'Department' }),
    level: rules.text({ min: 1, max: 30, label: 'Level' }),
  };

  // Lecturers can read the list (they need it to add students to a course).
  router.get('/', async (req, res) => {
    const query = validate(
      {
        search: req.query.search || undefined,
        department: req.query.department || undefined,
        level: req.query.level || undefined,
        page: req.query.page || undefined,
        excludeCourseId: req.query.excludeCourseId || undefined,
      },
      {
        search: rules.text({ max: 100, label: 'Search' }),
        department: rules.text({ max: 100, label: 'Department' }),
        level: rules.text({ max: 30, label: 'Level' }),
        page: rules.integer({ min: 1, max: 100000, label: 'Page' }),
        excludeCourseId: rules.integer({ label: 'Course' }),
      },
      { partial: true },
    );
    res.json(await students.list(query));
  });

  router.get('/filters', async (req, res) => {
    res.json(await students.filterOptions());
  });

  router.post('/', adminOnly, async (req, res) => {
    const input = validate(req.body, studentSchema);
    res.status(201).json({ student: await students.create(input) });
  });

  // Import a list. Every row is checked first, and nothing is saved
  // unless all rows are valid, so a half-imported list never happens.
  router.post('/import', adminOnly, async (req, res) => {
    const rows = req.body?.students;
    if (!Array.isArray(rows) || rows.length === 0) throw invalid({ students: 'Add at least one student.' });
    if (rows.length > MAX_IMPORT) throw invalid({ students: `Import up to ${MAX_IMPORT} students at a time.` });
    const clean = [];
    const rowErrors = [];
    rows.forEach((row, index) => {
      try {
        clean.push(validate(row, studentSchema));
      } catch (err) {
        rowErrors.push({ row: index + 1, message: Object.values(err.fields || {})[0] || 'Invalid row.' });
      }
    });
    if (rowErrors.length) {
      throw new HttpError(422, 'validation_error', 'Some rows could not be read. Nothing was imported.', {
        fields: { students: `${rowErrors.length} row(s) need fixing.` },
        details: { rows: rowErrors.slice(0, 20) },
      });
    }
    res.status(201).json(await students.createMany(clean));
  });

  router.get('/:id/attendance', async (req, res) => {
    const id = parseId(req.params.id, 'Student');
    const lecturerId = req.user.role === 'lecturer' ? req.user.id : null;
    res.json(await students.attendanceSummary(id, { lecturerId }));
  });

  router.patch('/:id', adminOnly, async (req, res) => {
    const id = parseId(req.params.id, 'Student');
    const changes = validate(req.body, studentSchema, { partial: true });
    res.json({ student: await students.update(id, changes) });
  });

  router.delete('/:id', adminOnly, async (req, res) => {
    await students.remove(parseId(req.params.id, 'Student'));
    res.status(204).end();
  });

  return router;
}
