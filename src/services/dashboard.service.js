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

    return {
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
