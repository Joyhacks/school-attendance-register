import bcrypt from 'bcryptjs';
import { badRequest, conflict, notFound, unauthorized } from '../utils/httpError.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so a wrong email takes
// as long as a wrong password and cannot be told apart by timing.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

function toUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: Boolean(row.is_active),
    courseCount: row.course_count ?? undefined,
    createdAt: row.created_at,
  };
}

export function createUserService(pool) {
  async function findActiveById(id) {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ? AND is_active = 1',
      [id],
    );
    return rows.length ? toUser(rows[0]) : null;
  }

  async function verifyLogin(email, password) {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at, password_hash FROM users WHERE email = ?',
      [email],
    );
    const row = rows[0];
    const matches = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !matches) throw unauthorized('Email or password is wrong.');
    if (!row.is_active) throw unauthorized('This account has been deactivated. Ask an admin to turn it back on.');
    return toUser(row);
  }

  async function list() {
    const [rows] = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.role, u.is_active, u.created_at,
              (SELECT COUNT(*) FROM courses c WHERE c.lecturer_id = u.id) AS course_count
       FROM users u
       ORDER BY u.is_active DESC, u.full_name`,
    );
    return rows.map(toUser);
  }

  async function create({ fullName, email, role, password }) {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    try {
      const [result] = await pool.query(
        'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
        [fullName, email, passwordHash, role],
      );
      return findById(result.insertId);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw conflict('Someone already uses that email.', { fields: { email: 'Someone already uses that email.' } });
      throw err;
    }
  }

  async function findById(id) {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, role, is_active, created_at FROM users WHERE id = ?',
      [id],
    );
    if (!rows.length) throw notFound('User');
    return toUser(rows[0]);
  }

  // actingUser cannot demote or deactivate themselves. That keeps at
  // least one working admin account at all times.
  async function update(id, changes, actingUser) {
    const existing = await findById(id);
    if (id === actingUser.id) {
      if (changes.role !== undefined && changes.role !== existing.role) throw badRequest('You cannot change your own role.');
      if (changes.isActive === false) throw badRequest('You cannot deactivate your own account.');
    }
    const columns = { fullName: 'full_name', email: 'email', role: 'role', isActive: 'is_active' };
    const sets = [];
    const values = [];
    for (const [key, column] of Object.entries(columns)) {
      if (changes[key] === undefined) continue;
      sets.push(`${column} = ?`);
      values.push(key === 'isActive' ? Number(changes[key]) : changes[key]);
    }
    if (sets.length) {
      try {
        await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...values, id]);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') throw conflict('Someone already uses that email.', { fields: { email: 'Someone already uses that email.' } });
        throw err;
      }
    }
    return findById(id);
  }

  async function setPassword(id, newPassword) {
    await findById(id);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, id]);
  }

  async function changeOwnPassword(id, currentPassword, newPassword) {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [id]);
    if (!rows.length) throw notFound('User');
    const matches = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!matches) throw badRequest('Check the highlighted fields.', { fields: { currentPassword: 'That is not your current password.' } });
    await setPassword(id, newPassword);
  }

  // Signs the user out everywhere, used after a password reset or deactivation.
  async function endSessionsFor(id, exceptSid = null) {
    await pool.query('DELETE FROM login_sessions WHERE user_id = ? AND sid <> ?', [id, exceptSid ?? '']);
  }

  return { findActiveById, verifyLogin, list, create, findById, update, setPassword, changeOwnPassword, endSessionsFor };
}
