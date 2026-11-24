import { withTransaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/httpError.js';

const COURSE_SELECT = `
  SELECT c.id, c.code, c.title, c.min_attendance, c.lecturer_id,
         u.full_name AS lecturer_name,
         (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count,
         (SELECT COUNT(*) FROM class_sessions cs WHERE cs.course_id = c.id) AS session_count,
         (SELECT MAX(cs.session_date) FROM class_sessions cs WHERE cs.course_id = c.id) AS last_session_date,
         (SELECT COUNT(*) FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar.session_id
            WHERE cs.course_id = c.id AND ar.status IN ('present', 'late')) AS attended_marks,
         (SELECT COUNT(*) FROM attendance_records ar JOIN class_sessions cs ON cs.id = ar.session_id
            WHERE cs.course_id = c.id AND ar.status = 'excused') AS excused_marks
  FROM courses c
  LEFT JOIN users u ON u.id = c.lecturer_id`;

function toCourse(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    minAttendance: row.min_attendance,
    lecturerId: row.lecturer_id,
    lecturerName: row.lecturer_name,
    studentCount: row.student_count,
    sessionCount: row.session_count,
    lastSessionDate: row.last_session_date,
    attendanceRate: courseRate(row),
  };
}

// Share of possible attendances that happened: every enrolled student
// at every class, minus excused ones. Unmarked counts as absent.
function courseRate(row) {
  const possible = row.session_count * row.student_count - row.excused_marks;
  if (possible <= 0) return null;
  return Math.round((row.attended_marks / possible) * 1000) / 10;
}

const duplicateCode = () =>
  conflict('A course with that code already exists.', { fields: { code: 'A course with that code already exists.' } });

export function createCourseService(pool) {
  // Admins see every course. Lecturers see the courses assigned to them.
  async function listFor(user) {
    const scoped = user.role === 'lecturer';
    const [rows] = await pool.query(
      `${COURSE_SELECT} ${scoped ? 'WHERE c.lecturer_id = ?' : ''} ORDER BY c.code`,
      scoped ? [user.id] : [],
    );
    return rows.map(toCourse);
  }

  // The single permission check for anything inside a course.
  // Returns the course, or throws 404 / 403.
  async function getFor(user, courseId) {
    const [rows] = await pool.query(`${COURSE_SELECT} WHERE c.id = ?`, [courseId]);
    if (!rows.length) throw notFound('Course');
    const course = toCourse(rows[0]);
    if (user.role !== 'admin' && course.lecturerId !== user.id) {
      throw forbidden('This course is assigned to another lecturer.');
    }
    return course;
  }

  async function assertLecturerExists(lecturerId) {
    if (lecturerId === null || lecturerId === undefined) return;
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ? AND is_active = 1', [lecturerId]);
    if (!rows.length) throw badRequest('Check the highlighted fields.', { fields: { lecturerId: 'Pick an active lecturer.' } });
  }

  async function create(user, { code, title, lecturerId, minAttendance }) {
    await assertLecturerExists(lecturerId);
    try {
      const [result] = await pool.query(
        'INSERT INTO courses (code, title, lecturer_id, min_attendance) VALUES (?, ?, ?, ?)',
        [code, title, lecturerId ?? null, minAttendance],
      );
      return getFor(user, result.insertId);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw duplicateCode();
      throw err;
    }
  }

  async function update(user, courseId, changes) {
    await getFor(user, courseId);
    if (changes.lecturerId !== undefined) await assertLecturerExists(changes.lecturerId);
    const columns = { code: 'code', title: 'title', lecturerId: 'lecturer_id', minAttendance: 'min_attendance' };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
      if (changes[key] === undefined) continue;
      sets.push(`${column} = ?`);
      values.push(changes[key]);
    }
    if (sets.length) {
      try {
        await pool.query(`UPDATE courses SET ${sets.join(', ')} WHERE id = ?`, [...values, courseId]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw duplicateCode();
        throw err;
      }
    }
    return getFor(user, courseId);
  }

  async function remove(courseId) {
    const [result] = await pool.query('DELETE FROM courses WHERE id = ?', [courseId]);
    if (!result.affectedRows) throw notFound('Course');
  }

  async function listStudents(courseId) {
    const [rows] = await pool.query(
      `SELECT s.id, s.matric_no, s.full_name, s.department, s.level
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       WHERE e.course_id = ?
       ORDER BY s.full_name, s.id`,
      [courseId],
    );
    return rows.map((row) => ({
      id: row.id,
      matricNo: row.matric_no,
      fullName: row.full_name,
      department: row.department,
      level: row.level,
    }));
  }

  // Adds students by id. Ids that do not exist are ignored, and a
  // student who is already in the course is left as is.
  async function enrollByIds(courseId, studentIds) {
    const [result] = await pool.query(
      `INSERT IGNORE INTO enrollments (course_id, student_id)
       SELECT ?, s.id FROM students s WHERE s.id IN (?)`,
      [courseId, studentIds],
    );
    return { added: result.affectedRows };
  }

  // Adds a whole class in one go, for example every 200 Level
  // Computer Science student.
  async function enrollByGroup(courseId, { department, level }) {
    const [result] = await pool.query(
      `INSERT IGNORE INTO enrollments (course_id, student_id)
       SELECT ?, s.id FROM students s WHERE s.department = ? AND s.level = ?`,
      [courseId, department, level],
    );
    return { added: result.affectedRows };
  }

  // Removes a student from the course together with their marks in it,
  // so class totals never count someone who is no longer on the list.
  async function unenroll(courseId, studentId) {
    return withTransaction(pool, async (conn) => {
      const [result] = await conn.query('DELETE FROM enrollments WHERE course_id = ? AND student_id = ?', [courseId, studentId]);
      if (!result.affectedRows) throw notFound('Student in this course');
      await conn.query(
        `DELETE ar FROM attendance_records ar
         JOIN class_sessions cs ON cs.id = ar.session_id
         WHERE cs.course_id = ? AND ar.student_id = ?`,
        [courseId, studentId],
      );
    });
  }

  return { listFor, getFor, create, update, remove, listStudents, enrollByIds, enrollByGroup, unenroll };
}
