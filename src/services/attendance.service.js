import { withTransaction } from '../db/pool.js';
import { computeAttendance, attendanceStanding } from '../utils/attendanceMath.js';
import { conflict, invalid, notFound } from '../utils/httpError.js';

function toSession(row) {
  return {
    id: row.id,
    courseId: row.course_id,
    date: row.session_date,
    period: row.period,
    topic: row.topic,
  };
}

export function createAttendanceService(pool) {
  // Classes held for a course, newest first, with a tally for each.
  async function listSessions(courseId) {
    const [rows] = await pool.query(
      `SELECT cs.id, cs.course_id, cs.session_date, cs.period, cs.topic,
              COALESCE(SUM(ar.status = 'present'), 0) AS present,
              COALESCE(SUM(ar.status = 'late'), 0) AS late,
              COALESCE(SUM(ar.status = 'absent'), 0) AS absent,
              COALESCE(SUM(ar.status = 'excused'), 0) AS excused
       FROM class_sessions cs
       LEFT JOIN attendance_records ar ON ar.session_id = cs.id
       WHERE cs.course_id = ?
       GROUP BY cs.id, cs.course_id, cs.session_date, cs.period, cs.topic
       ORDER BY cs.session_date DESC, cs.period DESC`,
      [courseId],
    );
    return rows.map((row) => ({
      ...toSession(row),
      present: row.present,
      late: row.late,
      absent: row.absent,
      excused: row.excused,
    }));
  }

  // Creates a class. If the same course, date and period already
  // exists, answers 409 with the id of the existing class so the
  // screen can open it instead of making a second copy.
  async function createSession(courseId, { date, period, topic }, userId) {
    try {
      const [result] = await pool.query(
        'INSERT INTO class_sessions (course_id, session_date, period, topic, created_by) VALUES (?, ?, ?, ?, ?)',
        [courseId, date, period, topic, userId],
      );
      return { id: result.insertId, courseId, date, period, topic };
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
      const [rows] = await pool.query(
        'SELECT id FROM class_sessions WHERE course_id = ? AND session_date = ? AND period = ?',
        [courseId, date, period],
      );
      throw conflict('A register for this class already exists.', { details: { existingSessionId: rows[0]?.id } });
    }
  }

  async function findSession(sessionId) {
    const [rows] = await pool.query(
      'SELECT id, course_id, session_date, period, topic FROM class_sessions WHERE id = ?',
      [sessionId],
    );
    if (!rows.length) throw notFound('Class');
    return toSession(rows[0]);
  }

  // Everyone in the course with their mark for this class.
  // status is null when the student has not been marked yet.
  async function getRegister(session) {
    const [rows] = await pool.query(
      `SELECT s.id, s.matric_no, s.full_name, ar.status
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.session_id = ?
       WHERE e.course_id = ?
       ORDER BY s.full_name, s.id`,
      [session.id, session.courseId],
    );
    return rows.map((row) => ({
      studentId: row.id,
      matricNo: row.matric_no,
      fullName: row.full_name,
      status: row.status,
    }));
  }

  // Saves marks for a class in one transaction. Saving the same marks
  // twice gives the same result, so a retry after a slow connection is safe.
  async function saveRegister(session, records, userId) {
    const byStudent = new Map(records.map((record) => [record.studentId, record.status]));
    const studentIds = [...byStudent.keys()];
    if (!studentIds.length) return { saved: 0 };

    return withTransaction(pool, async (conn) => {
      const [enrolled] = await conn.query(
        'SELECT student_id FROM enrollments WHERE course_id = ? AND student_id IN (?)',
        [session.courseId, studentIds],
      );
      if (enrolled.length !== studentIds.length) {
        throw invalid({ records: 'One or more students are not in this course. Reload the register and try again.' });
      }
      const rows = studentIds.map((studentId) => [session.id, studentId, byStudent.get(studentId), userId]);
      await conn.query(
        `INSERT INTO attendance_records (session_id, student_id, status, marked_by) VALUES ?
         ON DUPLICATE KEY UPDATE status = VALUES(status), marked_by = VALUES(marked_by)`,
        [rows],
      );
      return { saved: rows.length };
    });
  }

  async function removeSession(sessionId) {
    const [result] = await pool.query('DELETE FROM class_sessions WHERE id = ?', [sessionId]);
    if (!result.affectedRows) throw notFound('Class');
  }

  // Attendance summary for every student in a course.
  async function courseReport(course) {
    const [rows] = await pool.query(
      `SELECT s.id, s.matric_no, s.full_name, s.department, s.level,
              COUNT(cs.id) AS held,
              COALESCE(SUM(ar.status = 'present'), 0) AS present,
              COALESCE(SUM(ar.status = 'late'), 0) AS late,
              COALESCE(SUM(ar.status = 'excused'), 0) AS excused
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       LEFT JOIN class_sessions cs ON cs.course_id = e.course_id
       LEFT JOIN attendance_records ar ON ar.session_id = cs.id AND ar.student_id = s.id
       WHERE e.course_id = ?
       GROUP BY s.id, s.matric_no, s.full_name, s.department, s.level
       ORDER BY s.full_name, s.id`,
      [course.id],
    );
    const students = rows.map((row) => {
      const { percent } = computeAttendance(row);
      return {
        studentId: row.id,
        matricNo: row.matric_no,
        fullName: row.full_name,
        department: row.department,
        level: row.level,
        present: row.present,
        late: row.late,
        absent: row.held - row.present - row.late - row.excused,
        excused: row.excused,
        percent,
        standing: attendanceStanding(percent, course.minAttendance),
      };
    });
    return {
      sessionsHeld: course.sessionCount,
      minAttendance: course.minAttendance,
      atRiskCount: students.filter((s) => s.standing === 'at_risk').length,
      students,
    };
  }

  return { listSessions, createSession, findSession, getRegister, saveRegister, removeSession, courseReport };
}
