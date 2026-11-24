// Made-up demo records: 2 lecturers, 24 students, 3 courses and six
// weeks of attendance. Every name is invented. Used by
// "npm run seed:demo" and by DEMO_DATA=true on a hosted install.
import bcrypt from 'bcryptjs';
import { withTransaction } from './pool.js';

const lecturers = [
  ['Dr. Funmilayo Adeyemi', 'f.adeyemi@demo.school'],
  ['Mr. Chinedu Okafor', 'c.okafor@demo.school'],
];
const names = [
  'Abdullahi Musa', 'Adaeze Nwosu', 'Babatunde Ogunleye', 'Blessing Effiong', 'Chiamaka Eze', 'Daniel Ojo',
  'Emeka Obi', 'Fatima Bello', 'Grace Akpan', 'Hauwa Ibrahim', 'Ifeanyi Uche', 'Joy Edet',
  'Kelechi Anyanwu', 'Lateef Salami', 'Mercy Olatunji', 'Ngozi Okeke', 'Olumide Bakare', 'Patience Udo',
  'Rasheed Lawal', 'Sadiq Yusuf', 'Temitope Afolabi', 'Uchenna Nnamdi', 'Victoria Bassey', 'Yetunde Adebayo',
];
const courses = [
  ['CSC 201', 'Data Structures', 0, 'Computer Science'],
  ['CSC 205', 'Database Systems', 0, 'Computer Science'],
  ['EEE 203', 'Circuit Theory', 1, 'Electrical Engineering'],
];
const topics = ['Introduction', 'Core concepts', 'Worked examples', 'Practical class', 'Revision', 'Test and review'];

const isoDate = (date) => date.toISOString().slice(0, 10);

export const DEMO_LECTURER_EMAILS = lecturers.map(([, email]) => email);

// Adds the demo records in one transaction. The two demo lecturers
// sign in with the password given here.
export async function seedDemoData(pool, password) {
  // Small seeded random generator, so the demo data is the same on every run.
  let seed = 20261124;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const passwordHash = await bcrypt.hash(password, 12);

  await withTransaction(pool, async (conn) => {

    const lecturerIds = [];
    for (const [fullName, email] of lecturers) {
      const [result] = await conn.query(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'lecturer')",
        [fullName, email, passwordHash],
      );
      lecturerIds.push(result.insertId);
    }

    const studentsByDepartment = { 'Computer Science': [], 'Electrical Engineering': [] };
    for (const [index, fullName] of names.entries()) {
      const department = index % 3 === 2 ? 'Electrical Engineering' : 'Computer Science';
      const prefix = department === 'Computer Science' ? 'CSC' : 'EEE';
      const matricNo = `${prefix}/24/${String(index + 1).padStart(4, '0')}`;
      const [result] = await conn.query(
        'INSERT INTO students (matric_no, full_name, department, level) VALUES (?, ?, ?, ?)',
        [matricNo, fullName, department, '200 Level'],
      );
      // Each student gets their own habit: most attend well, a few do not.
      studentsByDepartment[department].push({ id: result.insertId, reliability: 0.55 + random() * 0.43 });
    }

    for (const [code, title, lecturerIndex, department] of courses) {
      const [course] = await conn.query(
        'INSERT INTO courses (code, title, lecturer_id, min_attendance) VALUES (?, ?, ?, 75)',
        [code, title, lecturerIds[lecturerIndex]],
      );
      const students = studentsByDepartment[department];
      await conn.query('INSERT INTO enrollments (course_id, student_id) VALUES ?', [students.map((s) => [course.insertId, s.id])]);

      // Six weekly classes, the latest one a few days ago.
      for (let week = 5; week >= 0; week -= 1) {
        const date = new Date();
        date.setUTCDate(date.getUTCDate() - (week * 7 + 2));
        const [session] = await conn.query(
          'INSERT INTO class_sessions (course_id, session_date, period, topic, created_by) VALUES (?, ?, 1, ?, ?)',
          [course.insertId, isoDate(date), topics[5 - week], lecturerIds[lecturerIndex]],
        );
        const marks = students.map((student) => {
          const roll = random();
          let status = 'absent';
          if (roll < student.reliability) status = 'present';
          else if (roll < student.reliability + 0.07) status = 'late';
          else if (roll > 0.97) status = 'excused';
          return [session.insertId, student.id, status, lecturerIds[lecturerIndex]];
        });
        await conn.query('INSERT INTO attendance_records (session_id, student_id, status, marked_by) VALUES ?', [marks]);
      }
    }
  });
  return { students: names.length, courses: courses.length, lecturers: lecturers.length };
}
