// SQLite helpers — using Node 22+ native node:sqlite

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { config } from './config.js';

export function connect() {
  const db = new DatabaseSync(config.dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  return db;
}

// Async-safe: awaits fn even if it returns a Promise, then closes.
export async function withConn(fn) {
  const db = connect();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

export function healthcheck() {
  if (!fs.existsSync(config.dbPath)) return false;
  try {
    const db = connect();
    const row = db
      .prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name='users';")
      .get();
    db.close();
    return row.c === 1;
  } catch {
    return false;
  }
}
