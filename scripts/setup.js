// One-time setup. Run with: npm run setup
//
// It asks a few questions, writes the .env file, creates the database
// and tables, and creates the first admin account.
//
// To run without questions (for servers and tests) pass --yes and set
// DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, SCHOOL_NAME,
// ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD as environment variables.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { rules } from '../src/utils/validators.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const skipQuestions = process.argv.includes('--yes');

const saved = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
const current = { ...saved, ...process.env };
const rl = skipQuestions ? null : readline.createInterface({ input: process.stdin });
// Reading answers through an iterator keeps every typed line, even
// when several arrive at once (pasted answers, or a script feeding them in).
const answers = rl ? rl[Symbol.asyncIterator]() : null;

async function ask(question, fallback = '') {
  if (skipQuestions) return fallback;
  process.stdout.write(`${question}${fallback ? ` [${fallback}]` : ''}: `);
  const { value, done } = await answers.next();
  if (done) fail('the answers ended before setup finished. Run "npm run setup" again.');
  return value.trim() || fallback;
}

// The saved password is never printed back to the screen.
async function askDbPassword() {
  if (skipQuestions) return current.DB_PASSWORD || '';
  if (!saved.DB_PASSWORD) return ask('MySQL password (press Enter if there is none, as on XAMPP)');
  return (await ask('MySQL password (press Enter to keep the saved one)')) || saved.DB_PASSWORD;
}

// Keeps asking until the answer passes the rule.
async function askValid(question, rule, fallback = '') {
  for (;;) {
    const result = rule(await ask(question, fallback));
    if (!result.error) return result.value;
    console.log(`  ${result.error}`);
    if (skipQuestions) process.exit(1);
  }
}

function fail(message) {
  console.error(`\nSetup stopped: ${message}\n`);
  process.exit(1);
}

console.log('\nAttendance system setup\n-----------------------');
console.log('Press Enter to accept the value in [brackets].\n');

const db = {
  host: await ask('MySQL host', current.DB_HOST || 'localhost'),
  port: Number(await ask('MySQL port', current.DB_PORT || '3306')),
  user: await ask('MySQL username', current.DB_USER || 'root'),
  password: await askDbPassword(),
  database: await ask('Database name', current.DB_NAME || 'attendance_system'),
};
if (!/^[A-Za-z0-9_]{1,64}$/.test(db.database)) fail('The database name can only use letters, numbers and underscores.');
const schoolName = await ask('School name', current.SCHOOL_NAME || 'My School');

// 1. Connect and create the database and tables
let conn;
try {
  conn = await mysql.createConnection({
    host: db.host, port: db.port, user: db.user, password: db.password, multipleStatements: true, charset: 'utf8mb4',
  });
} catch (err) {
  if (err.code === 'ECONNREFUSED') fail('MySQL is not running. Start it (in XAMPP, press Start next to MySQL) and run setup again.');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') fail('MySQL refused that username or password.');
  fail(err.message);
}

await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
await conn.query(`USE \`${db.database}\``);
await conn.query(fs.readFileSync(path.join(root, 'database', 'schema.sql'), 'utf8'));
console.log(`\nDatabase "${db.database}" is ready.`);

// 2. Write .env, keeping the existing secret if there is one
const sessionSecret = saved.SESSION_SECRET && saved.SESSION_SECRET.length >= 32
  ? saved.SESSION_SECRET
  : crypto.randomBytes(48).toString('hex');
// Wraps a value in whichever quote mark it does not contain, so
// passwords with symbols are read back from .env exactly as typed.
function quote(value) {
  const text = String(value);
  const mark = ["'", '"', '`'].find((candidate) => !text.includes(candidate));
  if (mark === undefined || /[\r\n]/.test(text)) fail('That value has a mix of quote marks or a line break that cannot be saved to .env.');
  return `${mark}${text}${mark}`;
}
// Settings setup does not ask about (motto, address, project note and
// anything added by hand) are kept exactly as they were.
const managed = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'PORT', 'SCHOOL_NAME', 'SESSION_SECRET', 'NODE_ENV'];
const kept = Object.entries(saved)
  .filter(([key]) => !managed.includes(key))
  .map(([key, value]) => `${key}=${quote(value)}`);
fs.writeFileSync(
  envPath,
  [
    '# Written by "npm run setup". Keep this file private.',
    `DB_HOST=${db.host}`,
    `DB_PORT=${db.port}`,
    `DB_USER=${db.user}`,
    `DB_PASSWORD=${quote(db.password)}`,
    `DB_NAME=${db.database}`,
    `PORT=${saved.PORT || '3000'}`,
    `SCHOOL_NAME=${quote(schoolName)}`,
    `SESSION_SECRET=${sessionSecret}`,
    `NODE_ENV=${saved.NODE_ENV || 'development'}`,
    ...kept,
    '',
  ].join('\n'),
  { mode: 0o600 },
);
console.log('Settings saved to .env.');

// 3. First admin account
const [[{ admins }]] = await conn.query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin'");
if (admins > 0) {
  console.log('An admin account already exists, so none was created.');
} else {
  console.log('\nCreate the first admin account. You sign in with this.');
  const fullName = await askValid('Your full name', rules.text({ min: 2, max: 120, label: 'Full name' }), current.ADMIN_NAME);
  const email = await askValid('Your email', rules.email(), current.ADMIN_EMAIL);
  const password = await askValid('Choose a password (8 characters or more)', rules.password(), skipQuestions ? current.ADMIN_PASSWORD : '');
  const passwordHash = await bcrypt.hash(password, 12);
  await conn.query("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')", [fullName, email, passwordHash]);
  console.log(`Admin account created for ${email}.`);
}

await conn.end();
rl?.close();
console.log('\nSetup finished. Start the system with:\n\n  npm start\n');
