import { withTransaction } from '../db/pool.js';
import { computeAttendance, attendanceStanding } from '../utils/attendanceMath.js';
import { conflict, notFound } from '../utils/httpError.js';
import { likeTerm } from '../utils/validators.js';

const PAGE_SIZE = 25;

function toStudent(row) {
  return {
    id: row.id,
    matricNo: row.matric_no,
    fullName: row.full_name,
    department: row.department,
    level: row.level,
  };
}

const duplicateMatric = () =>
  conflict('A student with that matric number already exists.', {
    fields: { matricNo: 'A student with that matric number already exists.' },
  });

export function createStudentService(pool) {
  async function list({ search, department, level, page = 1, excludeCourseId }) {
    const where = [];
    const params = [];
    if (search) {
      where.push('(s.full_name LIKE ? OR s.matric_no LIKE ?)');
      params.push(likeTerm(search), likeTerm(search));
    }
    if (department) {
      where.push('s.department = ?');
      params.push(department);
    }
    if (level) {
      where.push('s.level = ?');
      params.push(level);
    }
    if (excludeCourseId) {
      where.push('NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.course_id = ?)');
      params.push(excludeCourseId);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM students s ${whereSql}`, params);
    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(Math.max(1, page), pageCount);
    const [rows] = await pool.query(
      `SELECT s.id, s.matric_no, s.full_name, s.department, s.level
       FROM students s ${whereSql}
       ORDER BY s.full_name, s.id
       LIMIT ? OFFSET ?`,
      [...params, PAGE_SIZE, (safePage - 1) * PAGE_SIZE],
    );
    return { students: rows.map(toStudent), total, page: safePage, pageCount, pageSize: PAGE_SIZE };
  }

  // Distinct departments and levels, used to fill the filter dropdowns.
  async function filterOptions() {
    const [departments] = await pool.query('SELECT DISTINCT department FROM students ORDER BY department');
    const [levels] = await pool.query('SELECT DISTINCT level FROM students ORDER BY level');
    return { departments: departments.map((r) => r.department), levels: levels.map((r) => r.level) };
  }

  async function findById(id) {
    const [rows] = await pool.query(
      'SELECT id, matric_no, full_name, department, level FROM students WHERE id = ?',
      [id],
    );
    if (!rows.length) throw notFound('Student');
    return toStudent(rows[0]);
  }

  async function create({ matricNo, fullName, department, level }) {
    try {
      const [result] = await pool.query(
        'INSERT INTO students (matric_no, full_name, department, level) VALUES (?, ?, ?, ?)',
        [matricNo, fullName, department, level],
      );
      return findById(result.insertId);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw duplicateMatric();
      throw err;
    }
  }

  // Adds many students at once. Matric numbers that already exist are
  // skipped and reported back, so importing the same list twice is safe.
  async function createMany(students) {
    return withTransaction(pool, async (conn) => {
      const matricNos = students.map((s) => s.matricNo);
      const [existingRows] = await conn.query('SELECT matric_no FROM students WHERE matric_no IN (?)', [matricNos]);
      const existing = new Set(existingRows.map((r) => r.matric_no.toLowerCase()));
      const seen = new Set();
      const fresh = [];
      const skipped = [];
      for (const student of students) {
        const key = student.matricNo.toLowerCase();
        if (existing.has(key) || seen.has(key)) skipped.push(student.matricNo);
        else {
          seen.add(key);
          fresh.push([student.matricNo, student.fullName, student.department, student.level]);
        }
      }
      if (fresh.length) {
        await conn.query('INSERT INTO students (matric_no, full_name, department, level) VALUES ?', [fresh]);
      }
      return { added: fresh.length, skipped };
    });
  }

  async function update(id, changes) {
    await findById(id);
    const columns = { matricNo: 'matric_no', fullName: 'full_name', department: 'department', level: 'level' };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
      if (changes[key] === undefined) continue;
      sets.push(`${column} = ?`);
      values.push(changes[key]);
    }
    if (sets.length) {
      try {
        await pool.query(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw duplicateMatric();
        throw err;
      }
    }
    return findById(id);
  }

  async function remove(id) {
    const [result] = await pool.query('DELETE FROM students WHERE id = ?', [id]);
    if (!result.affectedRows) throw notFound('Student');
  }

  // One student's attendance in each course they take.
  // lecturerId limits the result to that lecturer's courses.
  async function attendanceSummary(id, { lecturerId = null } = {}) {
    const student = await findById(id);
    const params = [id];
    let scope = '';
    if (lecturerId) {
      scope = 'AND c.lecturer_id = ?';
      params.push(lecturerId);
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.code, c.title, c.min_attendance,
              COUNT(cs.id) AS held,
              COALESCE(SUM(ar.status = 'present'), 0) AS present,
              COALESCE(SUM(ar.status = 'late'), 0) AS late,
              COALESCE(SUM(ar.status = 'absent'), 0) AS absent,
              COALESCE(SUM(ar.status = 'excused'), 0) AS excused
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN class_sessions cs ON cs.course_id = c.id
       LEFT JOIN attendance_records ar ON ar.session_id = cs.id AND ar.student_id = e.student_id
       WHERE e.student_id = ? ${scope}
       GROUP BY c.id, c.code, c.title, c.min_attendance
       ORDER BY c.code`,
      params,
    );
    const courses = rows.map((row) => {
      const { percent } = computeAttendance(row);
      return {
        courseId: row.id,
        code: row.code,
        title: row.title,
        minAttendance: row.min_attendance,
        held: row.held,
        present: row.present,
        late: row.late,
        absent: row.held - row.present - row.late - row.excused,
        excused: row.excused,
        percent,
        standing: attendanceStanding(percent, row.min_attendance),
      };
    });
    return { student, courses };
  }

  return { list, filterOptions, findById, create, createMany, update, remove, attendanceSummary };
}
