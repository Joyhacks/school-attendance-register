// Reads settings from the .env file and stops early with a clear
// message when something required is missing.
import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`\nMissing setting: ${name}.\nRun "npm run setup" first, or copy .env.example to .env and fill it in.\n`);
    process.exit(1);
  }
  return value;
}

const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 32) {
  console.error('\nSESSION_SECRET must be at least 32 characters. Run "npm run setup" to generate one.\n');
  process.exit(1);
}

// The database can be given as one URL (DATABASE_URL, as hosting
// services such as Railway provide it) or as separate DB_* settings.
function databaseSettings() {
  const url = process.env.DATABASE_URL || process.env.MYSQL_URL;
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      console.error('\nDATABASE_URL is not a valid address. It should look like mysql://user:password@host:3306/database\n');
      process.exit(1);
    }
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
  };
}

export const env = Object.freeze({
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,
  schoolName: process.env.SCHOOL_NAME || 'My School',
  // Optional. Shown under the school name on the sign-in page.
  schoolMotto: process.env.SCHOOL_MOTTO || '',
  // Optional. A short line shown on every page, for example
  // "Student project. Not an official school system."
  projectNote: process.env.PROJECT_NOTE || '',
  sessionSecret,
  db: Object.freeze(databaseSettings()),
  // First admin, created on start when the system has no admin yet.
  // Used on hosting services where "npm run setup" cannot be run.
  firstAdmin: Object.freeze({
    name: process.env.ADMIN_NAME || 'Administrator',
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || '',
  }),
  // Fill an empty system with demo records on start (true or false).
  demo: Object.freeze({
    enabled: process.env.DEMO_DATA === 'true',
    password: process.env.DEMO_PASSWORD || '',
  }),
});
