import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { config } from './config.js';

const dbDir = path.dirname(config.dbPath);
fs.mkdirSync(dbDir, { recursive: true });

export const db = new Database(config.dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS licenses (
  license_key TEXT PRIMARY KEY,
  instance_id TEXT,
  status TEXT,
  customer_email TEXT,
  product_id TEXT,
  variant_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS license_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_key TEXT NOT NULL,
  device_id TEXT NOT NULL,
  instance_id TEXT,
  status TEXT NOT NULL,
  activated_at TEXT,
  deactivated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_license_device_active
ON license_activations(license_key, device_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT,
  event_id TEXT,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  license_key TEXT,
  device_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
`);

export function nowIso() {
  return new Date().toISOString();
}
