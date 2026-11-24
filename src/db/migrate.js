// Creates any missing tables. Safe to run on every start, because
// every statement in schema.sql is CREATE TABLE IF NOT EXISTS.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'database', 'schema.sql');

export async function ensureSchema(dbConfig) {
  const conn = await mysql.createConnection({ ...dbConfig, multipleStatements: true, charset: 'utf8mb4' });
  try {
    await conn.query(fs.readFileSync(schemaPath, 'utf8'));
  } finally {
    await conn.end();
  }
}
