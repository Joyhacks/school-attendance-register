import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { withTransaction } from '../db/pool.js';
import { DEMO_LECTURER_EMAILS, seedDemoData } from '../db/demoData.js';
import { badRequest, conflict } from '../utils/httpError.js';

// The one-time setup page on a fresh install: creates the first admin
// and, if asked, the demo data.
export function createSetupService(pool, getSetupCode) {
  async function needsSetup() {
    const [[{ admins }]] = await pool.query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin'");
    return admins === 0;
  }

  function codeMatches(given) {
    const expected = getSetupCode();
    if (!expected || typeof given !== 'string') return false;
    const a = Buffer.from(given.trim().toUpperCase());
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  async function complete({ setupCode, fullName, email, password, demoData }) {
    if (!codeMatches(setupCode)) {
      throw badRequest('Check the highlighted fields.', { fields: { setupCode: 'That setup code is not right. Copy it again from the server log.' } });
    }
    const passwordHash = await bcrypt.hash(password, 12);

    // The app_settings row works as a lock: if two people submit at the
    // same moment, only one insert succeeds and only one admin is made.
    await withTransaction(pool, async (conn) => {
      const [[{ admins }]] = await conn.query("SELECT COUNT(*) AS admins FROM users WHERE role = 'admin'");
      if (admins > 0) throw conflict('Setup is already done. Sign in instead.');
      try {
        await conn.query("INSERT INTO app_settings (name, value) VALUES ('first_admin_created', ?)", [email]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw conflict('Setup is already done. Sign in instead.');
        throw err;
      }
      await conn.query("INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')", [fullName, email, passwordHash]);
    });

    if (!demoData) return { demo: null };
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM students');
    if (total > 0) return { demo: null };
    const demoPassword = crypto.randomBytes(6).toString('base64url');
    await seedDemoData(pool, demoPassword);
    return { demo: { emails: DEMO_LECTURER_EMAILS, password: demoPassword } };
  }

  return { needsSetup, complete };
}
