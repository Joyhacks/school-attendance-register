// Start-up jobs for a hosted install, where nobody can run
// "npm run setup" by hand.
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
