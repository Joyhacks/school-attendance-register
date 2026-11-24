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

export const env = Object.freeze({
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,
  schoolName: process.env.SCHOOL_NAME || 'My School',
  sessionSecret,
  db: Object.freeze({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
  }),
});
