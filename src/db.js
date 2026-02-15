import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve('data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.SQLITE_PATH || path.join(dataDir, 'app.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');

export async function query(text, params = []) {
  const stmt = db.prepare(text);
  if (stmt.reader) {
    const rows = stmt.all(params);
    return { rows, rowCount: rows.length };
  }
  const info = stmt.run(params);
  return { rows: [], rowCount: info.changes, lastInsertRowid: info.lastInsertRowid };
}

export async function exec(sql) {
  db.exec(sql);
  return { rows: [], rowCount: 0 };
}
