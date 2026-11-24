// The one-time setup page on a fresh install. Uses its own database
// (your database name plus "_setup_test"), wiped on every run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { createApp } from '../../src/app.js';
import { ensureSessionSecret } from '../../src/db/bootstrap.js';
import { createPool } from '../../src/db/pool.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const db = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: `${process.env.DB_NAME || 'attendance_system'}_setup_test`,
};
const SETUP_CODE = 'ABCD-EFGH';
let pool;
let server;
let app;
let baseUrl;

async function call(method, url, body) {
  const response = await fetch(`${baseUrl}/api${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'attendance-app' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

const form = (overrides = {}) => ({
  setupCode: SETUP_CODE,
  fullName: 'First Admin',
  email: 'first@test.school',
  password: 'first-admin-pass',
  demoData: true,
  ...overrides,
});

before(async () => {
  const conn = await mysql.createConnection({ host: db.host, port: db.port, user: db.user, password: db.password, multipleStatements: true });
  await conn.query(`DROP DATABASE IF EXISTS \`${db.database}\``);
  await conn.query(`CREATE DATABASE \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${db.database}\``);
  await conn.query(fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8'));
  await conn.end();

  pool = createPool(db);
  const sessionSecret = await ensureSessionSecret(pool);
  app = createApp({ pool, config: { isProduction: false, schoolName: 'Test School', sessionSecret, setupCode: SETUP_CODE } });
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

test('the session secret is generated once and kept', async () => {
  const first = await ensureSessionSecret(pool);
  const second = await ensureSessionSecret(pool);
  assert.equal(first, second);
  assert.ok(first.length >= 64);
});

test('a fresh install asks for setup', async () => {
  assert.deepEqual((await call('GET', '/setup/status')).data, { needsSetup: true });
});

test('a wrong setup code is refused and creates nothing', async () => {
  const wrong = await call('POST', '/setup', form({ setupCode: 'ZZZZ-ZZZZ' }));
  assert.equal(wrong.status, 400);
  assert.ok(wrong.data.error.fields.setupCode);
  const [[{ users }]] = await pool.query('SELECT COUNT(*) AS users FROM users');
  assert.equal(users, 0);
});

test('bad details are listed field by field', async () => {
  const bad = await call('POST', '/setup', form({ email: 'nope', password: 'short', fullName: '' }));
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.data.error.fields).sort(), ['email', 'fullName', 'password']);
});

test('two people submitting at once make exactly one admin', async () => {
  const [a, b] = await Promise.all([
    call('POST', '/setup', form({ email: 'a@test.school', setupCode: 'abcd-efgh' })),
    call('POST', '/setup', form({ email: 'b@test.school' })),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  const [[{ admins }]] = await pool.query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin'");
  assert.equal(admins, 1);

  const winner = a.status === 201 ? a : b;
  assert.deepEqual(winner.data.demo.emails, ['f.adeyemi@demo.school', 'c.okafor@demo.school']);
  assert.ok(winner.data.demo.password.length >= 8);
  const [[{ students }]] = await pool.query('SELECT COUNT(*) AS students FROM students');
  assert.equal(students, 24, 'demo data was added');
});

test('setup cannot be run again once an admin exists', async () => {
  assert.deepEqual((await call('GET', '/setup/status')).data, { needsSetup: false });
  assert.equal((await call('POST', '/setup', form({ email: 'late@test.school' }))).status, 409);
});

test('the new admin can sign in', async () => {
  const [[row]] = await pool.query("SELECT email FROM users WHERE role = 'admin'");
  const login = await call('POST', '/auth/login', { email: row.email, password: 'first-admin-pass' });
  assert.equal(login.status, 200);
  assert.equal(login.data.user.role, 'admin');
});
