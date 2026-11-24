// Numbers for the home screen. Lecturers only get their own courses.
export function createDashboardService(pool) {
  async function summaryFor(user, today) {
    const scoped = user.role === 'lecturer';
    const courseScope = scoped ? 'WHERE c.lecturer_id = ?' : '';
    const scopeParams = scoped ? [user.id] : [];

    const [[counts]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM courses c ${courseScope}) AS courses,
         (SELECT COUNT(DISTINCT e.student_id)
            FROM enrollments e JOIN courses c ON c.id = e.course_id ${courseScope}) AS enrolled_students,
         (SELECT COUNT(*) FROM students) AS all_students,
         (SELECT COUNT(*)
            FROM class_sessions cs JOIN courses c ON c.id = cs.course_id
            ${courseScope ? `${courseScope} AND` : 'WHERE'} cs.session_date BETWEEN DATE_SUB(?, INTERVAL 6 DAY) AND ?) AS sessions_last_7_days`,
      [...scopeParams, ...scopeParams, ...scopeParams, today, today],
    );

    // Students whose attendance in a course is below that course's minimum.
    const [[risk]] = await pool.query(
      `SELECT COUNT(*) AS at_risk FROM (
         SELECT e.student_id, c.id AS course_id
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         JOIN class_sessions cs ON cs.course_id = c.id
         LEFT JOIN attendance_records ar ON ar.session_id = cs.id AND ar.student_id = e.student_id
         ${courseScope}
         GROUP BY e.student_id, c.id, c.min_attendance
         HAVING (COUNT(cs.id) - COALESCE(SUM(ar.status = 'excused'), 0)) > 0
            AND COALESCE(SUM(ar.status IN ('present', 'late')), 0) * 100
                < c.min_attendance * (COUNT(cs.id) - COALESCE(SUM(ar.status = 'excused'), 0))
       ) AS below`,
      scopeParams,
    );

    const [recent] = await pool.query(
      `SELECT cs.id, cs.session_date, cs.period, cs.topic, c.id AS course_id, c.code, c.title,
              COALESCE(SUM(ar.status IN ('present', 'late')), 0) AS attended,
              COUNT(ar.id) AS marked,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS enrolled
       FROM class_sessions cs
       JOIN courses c ON c.id = cs.course_id
       LEFT JOIN attendance_records ar ON ar.session_id = cs.id
       ${courseScope}
       GROUP BY cs.id, cs.session_date, cs.period, cs.topic, c.id, c.code, c.title
       ORDER BY cs.session_date DESC, cs.id DESC
       LIMIT 8`,
      scopeParams,
    );

    // Weekly attendance for the last 8 weeks, Monday to Sunday.
    const [weeks] = await pool.query(
      `SELECT DATE_SUB(cs.session_date, INTERVAL WEEKDAY(cs.session_date) DAY) AS week_start,
              COUNT(DISTINCT cs.id) AS classes,
              SUM(enrolled.n) AS possible,
              SUM(COALESCE(marks.attended, 0)) AS attended,
              SUM(COALESCE(marks.excused, 0)) AS excused
       FROM class_sessions cs
       JOIN courses c ON c.id = cs.course_id
       JOIN (SELECT course_id, COUNT(*) AS n FROM enrollments GROUP BY course_id) AS enrolled ON enrolled.course_id = cs.course_id
       LEFT JOIN (
         SELECT session_id,
                SUM(status IN ('present', 'late')) AS attended,
                SUM(status = 'excused') AS excused
         FROM attendance_records GROUP BY session_id
       ) AS marks ON marks.session_id = cs.id
       WHERE cs.session_date BETWEEN DATE_SUB(?, INTERVAL 55 DAY) AND ?
         ${scoped ? 'AND c.lecturer_id = ?' : ''}
       GROUP BY week_start
       ORDER BY week_start`,
      [today, today, ...scopeParams],
    );
    const weekly = buildWeeks(today, weeks);

    const totals = weeks.reduce(
      (sum, w) => ({ attended: sum.attended + Number(w.attended), counted: sum.counted + Number(w.possible) - Number(w.excused) }),
      { attended: 0, counted: 0 },
    );

    // Students below their course minimum, lowest first.
    const [atRiskRows] = await pool.query(
      `SELECT s.id, s.full_name, s.matric_no, c.id AS course_id, c.code, c.min_attendance,
              COUNT(cs.id) AS held,
              COALESCE(SUM(ar.status IN ('present', 'late')), 0) AS attended,
              COALESCE(SUM(ar.status = 'excused'), 0) AS excused
       FROM enrollments e
       JOIN students s ON s.id = e.student_id
       JOIN courses c ON c.id = e.course_id
       JOIN class_sessions cs ON cs.course_id = c.id
       LEFT JOIN attendance_records ar ON ar.session_id = cs.id AND ar.student_id = e.student_id
       ${courseScope}
       GROUP BY s.id, s.full_name, s.matric_no, c.id, c.code, c.min_attendance
       HAVING (held - excused) > 0 AND attended * 100 < c.min_attendance * (held - excused)
       ORDER BY attended / (held - excused), s.full_name
       LIMIT 6`,
      scopeParams,
    );

    return {
      attendanceRate: totals.counted > 0 ? Math.round((totals.attended / totals.counted) * 1000) / 10 : null,
      weekly,
      atRiskStudents: atRiskRows.map((row) => ({
        studentId: row.id,
        fullName: row.full_name,
        matricNo: row.matric_no,
        courseId: row.course_id,
        courseCode: row.code,
        minAttendance: row.min_attendance,
        percent: Math.round((row.attended / (row.held - row.excused)) * 1000) / 10,
      })),
      courses: counts.courses,
      students: scoped ? counts.enrolled_students : counts.all_students,
      sessionsLast7Days: counts.sessions_last_7_days,
      atRisk: risk.at_risk,
      recentSessions: recent.map((row) => ({
        id: row.id,
        date: row.session_date,
        period: row.period,
        topic: row.topic,
        courseId: row.course_id,
        courseCode: row.code,
        courseTitle: row.title,
        attended: row.attended,
        marked: row.marked,
        enrolled: row.enrolled,
      })),
    };
  }

  return { summaryFor };
}

// Fills in all 8 weeks, so a week with no classes still shows as empty.
function buildWeeks(today, rows) {
  const byStart = new Map(rows.map((row) => [row.week_start, row]));
  const end = new Date(`${today}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7));
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = new Date(end);
    start.setUTCDate(end.getUTCDate() - i * 7);
    const key = start.toISOString().slice(0, 10);
    const row = byStart.get(key);
    const counted = row ? Number(row.possible) - Number(row.excused) : 0;
    weeks.push({
      weekStart: key,
      classes: row ? Number(row.classes) : 0,
      rate: counted > 0 ? Math.round((Number(row.attended) / counted) * 1000) / 10 : null,
    });
  }
  return weeks;
}
