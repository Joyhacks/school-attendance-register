// Start-up jobs for a hosted install, where nobody can run
// "npm run setup" by hand.
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { rules } from '../utils/validators.js';
import { seedDemoData } from './demoData.js';

// Creates the first admin from the ADMIN_* settings, but only when
// there is no admin yet. Later changes to the settings are ignored, so
// a password changed in the app is never overwritten on restart.
export async function ensureFirstAdmin(pool, { name, email, password }) {
  const [[{ admins }]] = await pool.query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin'");
  if (admins > 0) return 'exists';
  if (!email || !password) return 'missing';
  const checks = [rules.text({ min: 2, max: 120, label: 'ADMIN_NAME' })(name), rules.email()(email), rules.password({ label: 'ADMIN_PASSWORD' })(password)];
  const problem = checks.find((check) => check.error);
  if (problem) throw new Error(problem.error);
  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')", [
    checks[0].value,
    checks[1].value,
    passwordHash,
  ]);
  return 'created';
}

// Adds demo records when switched on and the system has no students.
export async function ensureDemoData(pool, { enabled, password }) {
  if (!enabled) return 'off';
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM students');
  if (total > 0) return 'skipped';
  if (rules.password()(password).error) throw new Error('DEMO_PASSWORD must be 8 to 72 characters when DEMO_DATA is true.');
  await seedDemoData(pool, password);
  return 'added';
}

// Returns the session secret kept in the database, creating it on the
// first start. INSERT IGNORE means two servers starting together still
// end up with the same secret.
export async function ensureSessionSecret(pool) {
  await pool.query("INSERT IGNORE INTO app_settings (name, value) VALUES ('session_secret', ?)", [
    crypto.randomBytes(48).toString('hex'),
  ]);
  const [[row]] = await pool.query("SELECT value FROM app_settings WHERE name = 'session_secret'");
  return row.value;
}

// A short code for the one-time setup page, shown only in the server
// log, so only the person running the server can create the first admin.
export function makeSetupCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((byte) => letters[byte % letters.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}
