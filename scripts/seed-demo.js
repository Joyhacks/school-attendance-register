// Optional. Fills the system with made-up demo data so every screen has
// something to show. Run with: npm run seed:demo
// It refuses to run when students already exist, so it cannot mix demo
// records into real ones.
import crypto from 'node:crypto';
import { env } from '../src/config/env.js';
import { createPool } from '../src/db/pool.js';
import { DEMO_LECTURER_EMAILS, seedDemoData } from '../src/db/demoData.js';

const pool = createPool(env.db);
try {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM students');
  if (total > 0) {
    console.error('\nStudents already exist, so demo data was not added. Demo data is for an empty system.\n');
    process.exitCode = 1;
  } else {
    const password = crypto.randomBytes(6).toString('base64url');
    const result = await seedDemoData(pool, password);
    console.log(`\nDemo data added: ${result.students} students, ${result.courses} courses, ${result.lecturers} lecturers.`);
    console.log('\nDemo lecturer logins (write the password down, it is shown once):');
    for (const email of DEMO_LECTURER_EMAILS) console.log(`  ${email}`);
    console.log(`  Password for both: ${password}\n`);
  }
} catch (err) {
  console.error('\nDemo data was not added:', err.message, '\n');
  process.exitCode = 1;
} finally {
  await pool.end();
}
