import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// 1️⃣ Ensure the database directory exists
const dataDir = path.join(process.cwd(), 'data'); // absolute path
try {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log(`Created database directory: ${dataDir}`);
  }
} catch (err) {
  console.error('Failed to create database directory:', err);
  process.exit(1); // stop app if directory can't be created
}

// 2️⃣ Database file path
const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'app.db');
console.log(`Using SQLite DB at: ${dbPath}`);

// 3️⃣ Open database
const db = new Database(dbPath);
db.pragma('foreign_keys = ON'); // enforce foreign keys

// 4️⃣ Query helper
export async function query(text, params = []) {
  const stmt = db.prepare(text);
  if (stmt.reader) {
    const rows = stmt.all(params);
    return { rows, rowCount: rows.length };
  }
  const info = stmt.run(params);
  return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
}

// 5️⃣ Exec helper
export async function exec(sql) {
  db.exec(sql);
  return { rows: [], rowCount: 0 };
}
