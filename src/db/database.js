const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const dbPath = process.env.DB_PATH || './data/trolleys.db';
const uploadDir = process.env.UPLOAD_DIR || './uploads';

// Ensure directories exist
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

let db;
let saveInterval;

// Save database to disk periodically
const saveDB = () => {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
};

const initDB = async () => {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON;');

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT CHECK(role IN ('ADMIN','TECHNICIAN','INSPECTOR')),
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trolleys (
      id TEXT PRIMARY KEY,
      trolley_code TEXT UNIQUE NOT NULL,
      location TEXT,
      status TEXT CHECK(status IN ('ACTIVE','UNDER_MAINTENANCE','RETIRED')),
      condition TEXT CHECK(condition IN ('GOOD','FAIR','POOR','CRITICAL')),
      photo_url TEXT,
      qr_code TEXT,
      manufactured_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id TEXT PRIMARY KEY,
      trolley_id TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      type TEXT CHECK(type IN ('REPAIR','INSPECTION','CLEANING','REPLACEMENT')),
      description TEXT,
      parts_replaced TEXT,
      before_photo_url TEXT,
      after_photo_url TEXT,
      checklist_json TEXT,
      status TEXT CHECK(status IN ('COMPLETED','IN_PROGRESS')),
      created_at TEXT NOT NULL,
      FOREIGN KEY(trolley_id) REFERENCES trolleys(id),
      FOREIGN KEY(performed_by) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      trolley_id TEXT NOT NULL,
      reported_by TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      severity TEXT CHECK(severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
      photo_url TEXT,
      status TEXT CHECK(status IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')),
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(trolley_id) REFERENCES trolleys(id),
      FOREIGN KEY(reported_by) REFERENCES users(id),
      FOREIGN KEY(resolved_by) REFERENCES users(id)
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS maintenance_schedules (
      id TEXT PRIMARY KEY,
      trolley_id TEXT NOT NULL,
      maintenance_type TEXT,
      frequency_days INTEGER,
      next_due_date TEXT,
      assigned_to TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      FOREIGN KEY(trolley_id) REFERENCES trolleys(id),
      FOREIGN KEY(assigned_to) REFERENCES users(id)
    );
  `);

  // Auto-save every 5 seconds
  saveInterval = setInterval(saveDB, 5000);

  // Save on process exit
  process.on('exit', saveDB);
  process.on('SIGINT', () => { saveDB(); process.exit(); });
  process.on('SIGTERM', () => { saveDB(); process.exit(); });

  console.log('Database initialized successfully.');
  return db;
};

const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
};

// Helper: sql.js returns arrays of arrays. This converts to objects.
const queryAll = (sql, params = []) => {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

const queryOne = (sql, params = []) => {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
};

const runQuery = (sql, params = []) => {
  db.run(sql, params);
  saveDB();
  return { changes: db.getRowsModified() };
};

module.exports = { initDB, getDB, queryAll, queryOne, runQuery, saveDB };
