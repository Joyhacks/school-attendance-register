// End-to-end API tests. They need MySQL running and a .env file
// (run "npm run setup" first). They use their own database, named
// after yours with "_test" on the end, and wipe it on every run.
// Your real data is never touched.
//
// Run with: npm run test:api
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createApp } from '../../src/app.js';
import { createPool } from '../../src/db/pool.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: `${process.env.DB_NAME || 'attendance_system'}_test`,
};

const ADMIN = { email: 'admin@test.school', password: 'admin-password-1' };
let pool;
let server;
let app;
let baseUrl;

// A tiny browser stand-in that remembers its login cookie.
function client() {
  let cookie = '';
  async function request(method, url, body, { appHeader = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (appHeader) headers['X-Requested-With'] = 'attendance-app';
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(`${baseUrl}/api${url}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { status: response.status, data, headers: response.headers };
  }
  return {
    get: (url) => request('GET', url),
    post: (url, body, options) => request('POST', url, body, options),
    put: (url, body) => request('PUT', url, body),
    patch: (url, body) => request('PATCH', url, body),
    delete: (url) => request('DELETE', url),
    login: (email, password) => request('POST', '/auth/login', { email, password }),
  };
}

before(async () => {
  const conn = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, multipleStatements: true });
  await conn.query(`DROP DATABASE IF EXISTS \`${db.database}\``);
  await conn.query(`CREATE DATABASE \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${db.database}\``);
  await conn.query(fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8'));
  await conn.query("INSERT INTO users (full_name, email, password_hash, role) VALUES ('Test Admin', ?, ?, 'admin')", [
    ADMIN.email,
    await bcrypt.hash(ADMIN.password, 4),
  ]);
  await conn.end();

  pool = createPool(db);
  app = createApp({ pool, config: { isProduction: false, schoolName: 'Test School', sessionSecret: 'test-secret-that-is-long-enough-for-the-check' } });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  app.locals.close();
  await pool.end();
});

// Shared across the tests below, which run in order and build on each other.
const admin = client();
const lecturerA = client();
const lecturerB = client();
const ids = {};

test('signed-out visitors are refused', async () => {
  const visitor = client();
  assert.equal((await visitor.get('/courses')).status, 401);
  assert.equal((await visitor.get('/students')).status, 401);
  assert.equal((await visitor.get('/users')).status, 401);
  assert.deepEqual((await visitor.get('/auth/status')).data, { signedIn: false });
});

test('sign-in rejects a wrong password and accepts the right one', async () => {
  const wrong = await admin.login(ADMIN.email, 'wrong-password');
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error.message, 'Email or password is wrong.');

  const unknown = await admin.login('nobody@test.school', 'whatever-password');
  assert.equal(unknown.data.error.message, 'Email or password is wrong.', 'unknown email gives the same message');

  const ok = await admin.login(ADMIN.email, ADMIN.password);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.role, 'admin');
  assert.equal(ok.data.user.passwordHash, undefined);
  assert.equal(ok.data.user.password_hash, undefined);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(ok.headers.get('set-cookie'), /SameSite=Lax/i);
});

test('a request without the app header is blocked (cross-site form guard)', async () => {
  const response = await admin.post('/students', { matricNo: 'X/1', fullName: 'Cross Site', department: 'None', level: '1' }, { appHeader: false });
  assert.equal(response.status, 403);
});

test('admin creates staff accounts, with validation', async () => {
  const bad = await admin.post('/users', { fullName: '', email: 'nope', role: 'boss', password: 'short' });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.data.error.fields).sort(), ['email', 'fullName', 'password', 'role']);

  const a = await admin.post('/users', { fullName: 'Lecturer A', email: 'A@Test.School', role: 'lecturer', password: 'lecturer-a-pass' });
  assert.equal(a.status, 201);
  assert.equal(a.data.user.email, 'a@test.school');
  ids.lecturerA = a.data.user.id;

  const b = await admin.post('/users', { fullName: 'Lecturer B', email: 'b@test.school', role: 'lecturer', password: 'lecturer-b-pass' });
  ids.lecturerB = b.data.user.id;

  const duplicate = await admin.post('/users', { fullName: 'Copy', email: 'a@test.school', role: 'lecturer', password: 'lecturer-a-pass' });
  assert.equal(duplicate.status, 409);

  assert.equal((await lecturerA.login('a@test.school', 'lecturer-a-pass')).status, 200);
  assert.equal((await lecturerB.login('b@test.school', 'lecturer-b-pass')).status, 200);
});

test('admin cannot demote or deactivate their own account', async () => {
  const me = (await admin.get('/auth/me')).data.user;
  assert.equal((await admin.patch(`/users/${me.id}`, { role: 'lecturer' })).status, 400);
  assert.equal((await admin.patch(`/users/${me.id}`, { isActive: false })).status, 400);
});

test('students: create, duplicate, validation, search', async () => {
  const created = await admin.post('/students', { matricNo: 'CSC/1', fullName: '  Ada   Obi ', department: 'Computer Science', level: '200 Level' });
  assert.equal(created.status, 201);
  assert.equal(created.data.student.fullName, 'Ada Obi');
  ids.ada = created.data.student.id;

  assert.equal((await admin.post('/students', { matricNo: 'CSC/1', fullName: 'Other', department: 'Computer Science', level: '200 Level' })).status, 409);

  const invalid = await admin.post('/students', { matricNo: '', fullName: 'x'.repeat(200) });
  assert.equal(invalid.status, 422);
  assert.ok(invalid.data.error.fields.matricNo && invalid.data.error.fields.fullName && invalid.data.error.fields.department);

  const found = await admin.get('/students?search=ada');
  assert.equal(found.data.total, 1);

  // Search text is data, never SQL.
  const hostile = await admin.get(`/students?search=${encodeURIComponent("' OR 1=1 -- ")}`);
  assert.equal(hostile.status, 200);
  assert.equal(hostile.data.total, 0);
  assert.equal((await admin.get('/students?search=%25')).data.total, 0, 'a % sign is not a wildcard');
});

test('students: import skips duplicates and refuses a list with a bad row', async () => {
  const imported = await admin.post('/students/import', {
    students: [
      { matricNo: 'CSC/1', fullName: 'Ada Obi', department: 'Computer Science', level: '200 Level' },
      { matricNo: 'CSC/2', fullName: 'Bola Ade', department: 'Computer Science', level: '200 Level' },
      { matricNo: 'CSC/3', fullName: 'Chidi Eze', department: 'Computer Science', level: '200 Level' },
      { matricNo: 'EEE/1', fullName: 'Dayo Bello', department: 'Electrical Engineering', level: '200 Level' },
    ],
  });
  assert.equal(imported.status, 201);
  assert.equal(imported.data.added, 3);
  assert.deepEqual(imported.data.skipped, ['CSC/1']);

  const bad = await admin.post('/students/import', {
    students: [
      { matricNo: 'CSC/9', fullName: 'Good Row', department: 'Computer Science', level: '200 Level' },
      { matricNo: 'CSC/10', fullName: '', department: 'Computer Science', level: '200 Level' },
    ],
  });
  assert.equal(bad.status, 422);
  assert.equal(bad.data.error.details.rows[0].row, 2);
  assert.equal((await admin.get('/students?search=CSC/9')).data.total, 0, 'nothing from a bad list is saved');

  const list = await admin.get('/students');
  for (const s of list.data.students) ids[s.matricNo] = s.id;
});

test('lecturers cannot manage students or staff', async () => {
  assert.equal((await lecturerA.post('/students', { matricNo: 'L/1', fullName: 'Sneaky', department: 'X', level: '1' })).status, 403);
  assert.equal((await lecturerA.delete(`/students/${ids.ada}`)).status, 403);
  assert.equal((await lecturerA.get('/users')).status, 403);
  assert.equal((await lecturerA.post('/users', { fullName: 'New Admin', email: 'x@test.school', role: 'admin', password: 'password-123' })).status, 403);
  assert.equal((await lecturerA.post('/courses', { code: 'HAX 1', title: 'Nope', lecturerId: null, minAttendance: 75 })).status, 403);
  assert.equal((await lecturerA.get('/students')).status, 200, 'reading the list is allowed');
});

test('courses: create, duplicate code, enrol by group and by id', async () => {
  const created = await admin.post('/courses', { code: 'csc 201', title: 'Data Structures', lecturerId: ids.lecturerA, minAttendance: 75 });
  assert.equal(created.status, 201);
  assert.equal(created.data.course.code, 'CSC 201');
  ids.course = created.data.course.id;

  assert.equal((await admin.post('/courses', { code: 'CSC 201', title: 'Again', lecturerId: null, minAttendance: 75 })).status, 409);
  assert.equal((await admin.post('/courses', { code: 'CSC 999', title: 'Bad', lecturerId: 99999, minAttendance: 75 })).status, 400);
  assert.equal((await admin.post('/courses', { code: 'CSC 998', title: 'Bad', lecturerId: null, minAttendance: 140 })).status, 422);

  const group = await admin.post(`/courses/${ids.course}/students`, { department: 'Computer Science', level: '200 Level' });
  assert.equal(group.data.added, 3);
  const again = await admin.post(`/courses/${ids.course}/students`, { department: 'Computer Science', level: '200 Level' });
  assert.equal(again.data.added, 0, 'adding the same class twice changes nothing');

  const byId = await lecturerA.post(`/courses/${ids.course}/students`, { studentIds: [ids['EEE/1'], 424242] });
  assert.equal(byId.data.added, 1, 'unknown ids are ignored');
  assert.equal((await admin.get(`/courses/${ids.course}`)).data.course.studentCount, 4);
});

test('a lecturer only sees and opens their own courses', async () => {
  assert.equal((await lecturerA.get('/courses')).data.courses.length, 1);
  assert.equal((await lecturerB.get('/courses')).data.courses.length, 0);

  for (const url of [`/courses/${ids.course}`, `/courses/${ids.course}/students`, `/courses/${ids.course}/sessions`, `/courses/${ids.course}/report`]) {
    assert.equal((await lecturerB.get(url)).status, 403, url);
  }
  assert.equal((await lecturerB.post(`/courses/${ids.course}/sessions`, { date: '2026-11-02', period: 1 })).status, 403);
  assert.equal((await lecturerB.post(`/courses/${ids.course}/students`, { studentIds: [ids.ada] })).status, 403);
  assert.equal((await lecturerA.get('/courses/999999')).status, 404);
  assert.equal((await lecturerA.get('/courses/abc')).status, 404);
});

test('classes: create, reject bad dates, and never create the same class twice', async () => {
  assert.equal((await lecturerA.post(`/courses/${ids.course}/sessions`, { date: '2026-02-31', period: 1 })).status, 422);
  assert.equal((await lecturerA.post(`/courses/${ids.course}/sessions`, { date: '2026-11-02', period: 11 })).status, 422);

  // Two clicks at the same moment: one class is created, the other is told it exists.
  const [first, second] = await Promise.all([
    lecturerA.post(`/courses/${ids.course}/sessions`, { date: '2026-11-02', period: 1, topic: 'Arrays' }),
    lecturerA.post(`/courses/${ids.course}/sessions`, { date: '2026-11-02', period: 1, topic: 'Arrays' }),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  const made = first.status === 201 ? first : second;
  const refused = first.status === 409 ? first : second;
  ids.session1 = made.data.session.id;
  assert.equal(refused.data.error.details.existingSessionId, ids.session1);

  const next = await lecturerA.post(`/courses/${ids.course}/sessions`, { date: '2026-11-09', period: 1 });
  ids.session2 = next.data.session.id;
});

test('register: save marks, reject bad ones, saving twice changes nothing', async () => {
  const register = await lecturerA.get(`/sessions/${ids.session1}`);
  assert.equal(register.data.register.length, 4);
  assert.ok(register.data.register.every((row) => row.status === null));

  assert.equal((await lecturerB.get(`/sessions/${ids.session1}`)).status, 403);
  assert.equal((await lecturerB.put(`/sessions/${ids.session1}/attendance`, { records: [{ studentId: ids.ada, status: 'present' }] })).status, 403);

  assert.equal((await lecturerA.put(`/sessions/${ids.session1}/attendance`, { records: [{ studentId: ids.ada, status: 'sleeping' }] })).status, 422);
  assert.equal((await lecturerA.put(`/sessions/${ids.session1}/attendance`, { records: [] })).status, 422);
  assert.equal((await lecturerA.put(`/sessions/${ids.session1}/attendance`, { records: 'all present' })).status, 422);

  // A student from outside the course cannot be marked.
  const outsider = await admin.post('/students', { matricNo: 'OUT/1', fullName: 'Not Enrolled', department: 'Other', level: '100 Level' });
  const refused = await lecturerA.put(`/sessions/${ids.session1}/attendance`, {
    records: [{ studentId: ids.ada, status: 'present' }, { studentId: outsider.data.student.id, status: 'present' }],
  });
  assert.equal(refused.status, 422);
  assert.ok((await lecturerA.get(`/sessions/${ids.session1}`)).data.register.every((row) => row.status === null), 'a refused save writes nothing');

  const marks1 = [
    { studentId: ids.ada, status: 'present' },
    { studentId: ids['CSC/2'], status: 'late' },
    { studentId: ids['CSC/3'], status: 'absent' },
    { studentId: ids['EEE/1'], status: 'excused' },
  ];
  assert.equal((await lecturerA.put(`/sessions/${ids.session1}/attendance`, { records: marks1 })).data.saved, 4);
  assert.equal((await lecturerA.put(`/sessions/${ids.session1}/attendance`, { records: marks1 })).status, 200);
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM attendance_records WHERE session_id = ?', [ids.session1]);
  assert.equal(total, 4, 'saving twice does not duplicate marks');

  // Second class: Ada absent, CSC/2 present, CSC/3 not marked, EEE/1 present.
  await lecturerA.put(`/sessions/${ids.session2}/attendance`, {
    records: [
      { studentId: ids.ada, status: 'absent' },
      { studentId: ids['CSC/2'], status: 'present' },
      { studentId: ids['EEE/1'], status: 'present' },
    ],
  });

  // A mark can be corrected afterwards.
  await lecturerA.put(`/sessions/${ids.session2}/attendance`, { records: [{ studentId: ids.ada, status: 'present' }] });
});

test('report: percentages, standing and CSV', async () => {
  const { data } = await lecturerA.get(`/courses/${ids.course}/report`);
  assert.equal(data.report.sessionsHeld, 2);
  const byMatric = Object.fromEntries(data.report.students.map((s) => [s.matricNo, s]));

  assert.equal(byMatric['CSC/1'].percent, 100);
  assert.equal(byMatric['CSC/2'].percent, 100, 'late counts as attended');
  assert.equal(byMatric['CSC/3'].percent, 0, 'absent plus one unmarked class');
  assert.equal(byMatric['CSC/3'].absent, 2);
  assert.equal(byMatric['EEE/1'].percent, 100, 'excused class is left out');
  assert.equal(byMatric['CSC/3'].standing, 'at_risk');
  assert.equal(data.report.atRiskCount, 1);

  const csv = await lecturerA.get(`/courses/${ids.course}/report?format=csv`);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /CSC-201-attendance\.csv/);
  assert.ok(csv.data.includes('CSC/3,Chidi Eze'));

  const dashboard = await lecturerA.get('/dashboard?today=2026-11-10');
  assert.equal(dashboard.data.courses, 1);
  assert.equal(dashboard.data.students, 4);
  assert.equal(dashboard.data.atRisk, 1);
  assert.equal(dashboard.data.sessionsLast7Days, 1);
  assert.equal((await lecturerB.get('/dashboard?today=2026-11-10')).data.atRisk, 0);

  const summary = await admin.get(`/students/${ids['CSC/3']}/attendance`);
  assert.equal(summary.data.courses[0].percent, 0);
  assert.equal((await lecturerB.get(`/students/${ids['CSC/3']}/attendance`)).data.courses.length, 0, 'other lecturers see no courses');
});

test('removing a student from a course also removes their marks there', async () => {
  assert.equal((await lecturerA.delete(`/courses/${ids.course}/students/${ids['CSC/3']}`)).status, 204);
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM attendance_records WHERE student_id = ?', [ids['CSC/3']]);
  assert.equal(total, 0);
  assert.equal((await lecturerA.delete(`/courses/${ids.course}/students/${ids['CSC/3']}`)).status, 404);
});

test('changing a password signs out other devices', async () => {
  const otherDevice = client();
  await otherDevice.login('b@test.school', 'lecturer-b-pass');

  const wrong = await lecturerB.post('/auth/change-password', { currentPassword: 'not-it', newPassword: 'brand-new-pass' });
  assert.equal(wrong.status, 400);
  assert.ok(wrong.data.error.fields.currentPassword);

  assert.equal((await lecturerB.post('/auth/change-password', { currentPassword: 'lecturer-b-pass', newPassword: 'brand-new-pass' })).status, 204);
  assert.equal((await lecturerB.get('/auth/me')).status, 200, 'this device stays signed in');
  assert.equal((await otherDevice.get('/auth/me')).status, 401, 'the other device is signed out');
  assert.equal((await client().login('b@test.school', 'lecturer-b-pass')).status, 401);
  assert.equal((await client().login('b@test.school', 'brand-new-pass')).status, 200);
});

test('a deactivated account loses access at once', async () => {
  assert.equal((await lecturerA.get('/courses')).status, 200);
  assert.equal((await admin.patch(`/users/${ids.lecturerA}`, { isActive: false })).status, 200);
  assert.equal((await lecturerA.get('/courses')).status, 401);
  assert.equal((await client().login('a@test.school', 'lecturer-a-pass')).status, 401);
});

test('deleting a course removes its classes and marks', async () => {
  assert.equal((await admin.delete(`/courses/${ids.course}`)).status, 204);
  const [[{ sessions }]] = await pool.query('SELECT COUNT(*) AS sessions FROM class_sessions');
  const [[{ marks }]] = await pool.query('SELECT COUNT(*) AS marks FROM attendance_records');
  assert.equal(sessions, 0);
  assert.equal(marks, 0);
  assert.equal((await admin.get('/students')).data.total, 5, 'students themselves are kept');
});

test('sign out ends the session', async () => {
  assert.equal((await admin.post('/auth/logout')).status, 204);
  assert.equal((await admin.get('/auth/me')).status, 401);
});

test('errors never leak internals', async () => {
  const visitor = client();
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'attendance-app' },
    body: '{ this is not json',
  });
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.error.code, 'bad_request');
  assert.equal(JSON.stringify(body).includes('stack'), false);
  assert.equal((await visitor.get('/no-such-thing')).status, 401);
});
