// Starts the web server. Run with: npm start
import { env } from './config/env.js';
import { ensureDemoData, ensureFirstAdmin } from './db/bootstrap.js';
import { ensureSchema } from './db/migrate.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';

const pool = createPool(env.db);

// Create missing tables, then the first admin and demo data when the
// settings ask for them. Each step is safe to repeat on every start.
try {
  await ensureSchema(env.db);
  const admin = await ensureFirstAdmin(pool, env.firstAdmin);
  if (admin === 'created') console.log(`First admin account created for ${env.firstAdmin.email}.`);
  if (admin === 'missing') console.warn('No admin account exists yet. Run "npm run setup", or set ADMIN_EMAIL and ADMIN_PASSWORD.');
  if ((await ensureDemoData(pool, env.demo)) === 'added') console.log('Demo data added.');
} catch (err) {
  const hints = {
    ECONNREFUSED: 'MySQL is not running. Start it (in XAMPP, press Start next to MySQL) and try again.',
    ENOTFOUND: 'The database host could not be found. Check DB_HOST or DATABASE_URL.',
    ER_ACCESS_DENIED_ERROR: 'MySQL refused the username or password in your settings.',
    ER_BAD_DB_ERROR: 'The database does not exist yet. Run "npm run setup".',
  };
  console.error(`\nCould not start: ${hints[err.code] || err.message}\n`);
  process.exit(1);
}

const app = createApp({ pool, config: env });
const server = app.listen(env.port, () => {
  console.log(`\nAttendance system is running.\nOpen http://localhost:${env.port} in your browser.\nPress Ctrl + C to stop.\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${env.port} is already in use. Close the other program or change PORT in .env.\n`);
    process.exit(1);
  }
  throw err;
});

async function shutdown() {
  server.close();
  app.locals.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
