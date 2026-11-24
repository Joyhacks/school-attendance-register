import session from 'express-session';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Keeps login sessions in MySQL so people stay signed in when the
// server restarts. Uses the same pool as the rest of the app.
export class MySqlSessionStore extends session.Store {
  constructor(pool) {
    super();
    this.pool = pool;
    // Clear out expired sessions every hour. unref() lets the process exit.
    this.cleanupTimer = setInterval(() => this.clearExpired(), 60 * 60 * 1000);
    this.cleanupTimer.unref();
  }

  expiryFor(sess) {
    const expires = sess?.cookie?.expires ? new Date(sess.cookie.expires) : new Date(Date.now() + ONE_DAY_MS);
    return expires.toISOString().slice(0, 19).replace('T', ' ');
  }

  get(sid, callback) {
    this.pool
      .query('SELECT data FROM login_sessions WHERE sid = ? AND expires_at > UTC_TIMESTAMP()', [sid])
      .then(([rows]) => callback(null, rows.length ? JSON.parse(rows[0].data) : null))
      .catch((err) => callback(err));
  }

  set(sid, sess, callback) {
    this.pool
      .query(
        `INSERT INTO login_sessions (sid, user_id, data, expires_at) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), data = VALUES(data), expires_at = VALUES(expires_at)`,
        [sid, sess.userId ?? null, JSON.stringify(sess), this.expiryFor(sess)],
      )
      .then(() => callback?.(null))
      .catch((err) => callback?.(err));
  }

  touch(sid, sess, callback) {
    this.pool
      .query('UPDATE login_sessions SET expires_at = ? WHERE sid = ?', [this.expiryFor(sess), sid])
      .then(() => callback?.(null))
      .catch((err) => callback?.(err));
  }

  destroy(sid, callback) {
    this.pool
      .query('DELETE FROM login_sessions WHERE sid = ?', [sid])
      .then(() => callback?.(null))
      .catch((err) => callback?.(err));
  }

  clearExpired() {
    this.pool
      .query('DELETE FROM login_sessions WHERE expires_at <= UTC_TIMESTAMP()')
      .catch((err) => console.error('[sessions] cleanup failed:', err.message));
  }

  close() {
    clearInterval(this.cleanupTimer);
  }
}
