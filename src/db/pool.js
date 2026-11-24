import mysql from 'mysql2/promise';

// One shared connection pool for the whole app.
// dateStrings keeps DATE columns as "YYYY-MM-DD" so time zones never
// shift a class to the day before. stringifyObjects stops an object
// passed as a query value from being expanded into SQL.
export function createPool(dbConfig) {
  return mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
    dateStrings: true,
    decimalNumbers: true,
    stringifyObjects: true,
  });
}

// Runs fn inside a transaction. Everything in fn succeeds together
// or is rolled back together.
export async function withTransaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
