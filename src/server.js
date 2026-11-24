// Starts the web server. Run with: npm start
import { env } from './config/env.js';
import { createPool } from './db/pool.js';
import { createApp } from './app.js';

const pool = createPool(env.db);

try {
  await pool.query('SELECT 1 FROM users LIMIT 1');
} catch (err) {
  const hints = {
    ECONNREFUSED: 'MySQL is not running. Start it (in XAMPP, press Start next to MySQL) and try again.',
    ER_ACCESS_DENIED_ERROR: 'MySQL refused the username or password in .env.',
    ER_BAD_DB_ERROR: 'The database does not exist yet. Run "npm run setup".',
    ER_NO_SUCH_TABLE: 'The tables do not exist yet. Run "npm run setup".',
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
