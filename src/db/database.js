const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

dotenv.config();

const dbPath = process.env.DB_PATH || './data/trolleys.db';
const uploadDir = process.env.UPLOAD_DIR || './uploads';
const databaseUrl = process.env.DATABASE_URL;

// Ensure directories exist
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

let db = null;        // For SQLite
let pgPool = null;    // For PostgreSQL
let isPostgres = false;
let saveInterval = null;

// Convert '?' placeholders to '$1, $2, ...' and SQLite-specific syntax for PostgreSQL
function convertSqlForPg(sql) {
  let paramIndex = 1;
  let converted = sql.replace(/\?/g, () => `$${paramIndex++}`);
  
  // Replace SQLite date('now') or date('now', ...) with CURRENT_DATE
  converted = converted.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  // Replace INSERT OR IGNORE with INSERT ... ON CONFLICT DO NOTHING
  converted = converted.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  if (sql.toUpperCase().includes('INSERT OR IGNORE') && !converted.toUpperCase().includes('ON CONFLICT')) {
    converted += ' ON CONFLICT DO NOTHING';
  }
  return converted;
}

const sanitizeParams = (params = []) => {
  if (!Array.isArray(params)) return params;
  return params.map(p => (p === undefined ? null : p));
};

// Save SQLite database to disk periodically
const saveDB = () => {
  if (!isPostgres && db) {
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (e) {
      console.error('Error saving SQLite to disk:', e.message);
    }
  }
};

const initDB = async () => {
  if (databaseUrl) {
    console.log('[DB] Connecting to Cloud PostgreSQL database...');
    try {
      pgPool = new Pool({
        connectionString: databaseUrl,
        ssl: {
          rejectUnauthorized: false
        }
      });

      // Test connection
      await pgPool.query('SELECT 1');
      isPostgres = true;
      console.log('[DB] Connected to PostgreSQL successfully! Data will persist permanently.');

      // Initialize PostgreSQL tables
      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(64) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(32),
          is_active INTEGER DEFAULT 1,
          created_at VARCHAR(64) NOT NULL
        );
      `);

      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS trolleys (
          id VARCHAR(64) PRIMARY KEY,
          trolley_code VARCHAR(64) UNIQUE NOT NULL,
          location VARCHAR(255),
          status VARCHAR(64),
          condition VARCHAR(64),
          photo_url TEXT,
          qr_code TEXT,
          manufactured_date VARCHAR(64),
          last_service_date VARCHAR(64),
          notes TEXT,
          created_at VARCHAR(64) NOT NULL,
          updated_at VARCHAR(64) NOT NULL
        );
      `);

      // Migration: Ensure last_service_date and maintenance_reason columns exist and backfill
      try {
        await pgPool.query('ALTER TABLE trolleys ADD COLUMN IF NOT EXISTS last_service_date VARCHAR(64);');
        await pgPool.query('ALTER TABLE trolleys ADD COLUMN IF NOT EXISTS maintenance_reason TEXT;');
        await pgPool.query("UPDATE trolleys SET last_service_date = created_at WHERE last_service_date IS NULL OR last_service_date = '';");
      } catch (colErr) {
        console.log('[DB] Column check:', colErr.message);
      }

      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS maintenance_logs (
          id VARCHAR(64) PRIMARY KEY,
          trolley_id VARCHAR(64) NOT NULL,
          performed_by VARCHAR(64) NOT NULL,
          type VARCHAR(64),
          description TEXT,
          parts_replaced TEXT,
          before_photo_url TEXT,
          after_photo_url TEXT,
          checklist_json TEXT,
          status VARCHAR(64),
          created_at VARCHAR(64) NOT NULL
        );
      `);

      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS issues (
          id VARCHAR(64) PRIMARY KEY,
          trolley_id VARCHAR(64) NOT NULL,
          reported_by VARCHAR(64) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          severity VARCHAR(64),
          photo_url TEXT,
          status VARCHAR(64),
          resolved_by VARCHAR(64),
          resolved_at VARCHAR(64),
          created_at VARCHAR(64) NOT NULL
        );
      `);

      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS maintenance_schedules (
          id VARCHAR(64) PRIMARY KEY,
          trolley_id VARCHAR(64) NOT NULL,
          maintenance_type VARCHAR(64),
          frequency_days INTEGER,
          next_due_date VARCHAR(64),
          assigned_to VARCHAR(64),
          is_active INTEGER DEFAULT 1,
          created_at VARCHAR(64) NOT NULL
        );
      `);

      // Seed default admin accounts if they do not exist
      const salt = bcrypt.genSaltSync(10);
      const now = new Date().toISOString();
      const defaultUsers = [
        { id: 'admin-001', name: 'Atharv Khot (Admin)', email: 'atharvkhot@trolley.com', password: bcrypt.hashSync('admin123', salt), role: 'ADMIN' },
        { id: 'admin-002', name: 'Admin', email: 'admin@trolley.com', password: bcrypt.hashSync('admin123', salt), role: 'ADMIN' },
        { id: 'tech-001', name: 'Tech User', email: 'tech@trolley.com', password: bcrypt.hashSync('tech123', salt), role: 'TECHNICIAN' },
        { id: 'insp-001', name: 'Inspector User', email: 'inspector@trolley.com', password: bcrypt.hashSync('inspect123', salt), role: 'INSPECTOR' },
        { id: 'ath-001', name: 'Atharv', email: 'atharvkhot3@gmail.com', password: bcrypt.hashSync('@1234', salt), role: 'ADMIN' }
      ];

      for (const u of defaultUsers) {
        await pgPool.query(`
          INSERT INTO users (id, name, email, password_hash, role, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (email) DO NOTHING
        `, [u.id, u.name, u.email, u.password, u.role, now]);
      }

      // Seed default trolleys if table is empty
      const trolleyCount = await pgPool.query('SELECT COUNT(*) as count FROM trolleys');
      if (parseInt(trolleyCount.rows[0].count, 10) === 0) {
        console.log('[DB] Seeding initial trolleys in PostgreSQL...');
        const initialTrolleys = [
          { id: 'trl-001', code: 'TRL-001', location: 'Zone A Assembly', status: 'ACTIVE', condition: 'GOOD', notes: 'Front Bumper Carrier' },
          { id: 'trl-002', code: 'TRL-002', location: 'Zone B Paint', status: 'ACTIVE', condition: 'GOOD', notes: 'Rear Bumper Carrier' },
          { id: 'trl-003', code: 'TRL-003', location: 'Zone C Storage', status: 'UNDER_MAINTENANCE', condition: 'FAIR', notes: 'Wheel bearing check due' },
          { id: 'trl-004', code: 'TRL-004', location: 'Zone A Assembly', status: 'ACTIVE', condition: 'GOOD', notes: 'Heavy duty trolley' },
          { id: 'trl-005', code: 'TRL-005', location: 'Zone D Shipping', status: 'ACTIVE', condition: 'GOOD', notes: 'Buffer stock carrier' }
        ];

        for (const t of initialTrolleys) {
          await pgPool.query(`
            INSERT INTO trolleys (id, trolley_code, location, status, condition, notes, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (trolley_code) DO NOTHING
          `, [t.id, t.code, t.location, t.status, t.condition, t.notes, now, now]);
        }
      }

      return pgPool;
    } catch (pgError) {
      console.error('[DB] PostgreSQL connection failed! Falling back to local SQLite.', pgError.message);
      isPostgres = false;
    }
  }

  // Fallback: Local SQLite using sql.js
  console.log('[DB] Initializing Local SQLite database (sql.js)...');
  const SQL = await initSqlJs();

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
      last_service_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migration for existing SQLite database
  try {
    db.run('ALTER TABLE trolleys ADD COLUMN last_service_date TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.run('ALTER TABLE trolleys ADD COLUMN maintenance_reason TEXT;');
  } catch (e) {
    // Column already exists
  }
  try {
    db.run("UPDATE trolleys SET last_service_date = created_at WHERE last_service_date IS NULL OR last_service_date = '';");
  } catch (e) {}

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

  // Ensure default users exist in SQLite
  try {
    const salt = bcrypt.genSaltSync(10);
    const now = new Date().toISOString();
    const defaultUsers = [
      { id: 'admin-001', name: 'Atharv Khot (Admin)', email: 'atharvkhot@trolley.com', password: bcrypt.hashSync('admin123', salt), role: 'ADMIN' },
      { id: 'admin-002', name: 'Admin', email: 'admin@trolley.com', password: bcrypt.hashSync('admin123', salt), role: 'ADMIN' },
      { id: 'tech-001', name: 'Tech User', email: 'tech@trolley.com', password: bcrypt.hashSync('tech123', salt), role: 'TECHNICIAN' },
      { id: 'insp-001', name: 'Inspector User', email: 'inspector@trolley.com', password: bcrypt.hashSync('inspect123', salt), role: 'INSPECTOR' },
      { id: 'ath-001', name: 'Atharv', email: 'atharvkhot3@gmail.com', password: bcrypt.hashSync('@1234', salt), role: 'ADMIN' }
    ];

    for (const u of defaultUsers) {
      db.run(`
        INSERT OR IGNORE INTO users (id, name, email, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [u.id, u.name, u.email, u.password, u.role, now]);
    }
  } catch (seedErr) {
    console.error('Error seeding SQLite admin users:', seedErr.message);
  }

  saveDB();

  // Auto-save every 5 seconds
  if (!saveInterval) {
    saveInterval = setInterval(saveDB, 5000);
    process.on('exit', saveDB);
    process.on('SIGINT', () => { saveDB(); process.exit(); });
    process.on('SIGTERM', () => { saveDB(); process.exit(); });
  }

  console.log('[DB] Local SQLite initialized successfully.');
  return db;
};

const getDB = () => {
  if (isPostgres) return pgPool;
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
};

// Unified Query Execution that seamlessly handles both PostgreSQL and SQLite
const queryAll = async (sql, params = []) => {
  const sanitized = sanitizeParams(params);

  if (isPostgres && pgPool) {
    const pgSql = convertSqlForPg(sql);
    const res = await pgPool.query(pgSql, sanitized);
    return res.rows;
  }

  // SQLite execution
  const stmt = db.prepare(sql);
  if (sanitized.length > 0) stmt.bind(sanitized);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
};

const queryOne = async (sql, params = []) => {
  const results = await queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
};

const runQuery = async (sql, params = []) => {
  const sanitized = sanitizeParams(params);

  if (isPostgres && pgPool) {
    const pgSql = convertSqlForPg(sql);
    const res = await pgPool.query(pgSql, sanitized);
    return { changes: res.rowCount };
  }

  // SQLite execution
  db.run(sql, sanitized);
  saveDB();
  return { changes: db.getRowsModified() };
};

module.exports = {
  initDB,
  getDB,
  queryAll,
  queryOne,
  runQuery,
  saveDB,
  isPostgres: () => isPostgres
};
