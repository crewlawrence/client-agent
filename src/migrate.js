import fs from 'fs';
import path from 'path';
import { query } from './db.js';

const migrationsDir = path.resolve('db', 'migrations_sqlite');

async function ensureSchemaTable() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT (datetime('now'))
  )`);
}

async function getApplied() {
  const res = await query('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map((r) => r.filename));
}

async function applyMigration(filename) {
  const filePath = path.join(migrationsDir, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  await query(sql);
  await query('INSERT INTO schema_migrations (filename) VALUES (?)', [filename]);
  console.log(`Applied ${filename}`);
}

async function run() {
  await ensureSchemaTable();
  const applied = await getApplied();
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    await applyMigration(file);
  }

  console.log('Migrations complete');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
