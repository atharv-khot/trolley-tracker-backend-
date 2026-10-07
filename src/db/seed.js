const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDB, runQuery, saveDB } = require('./database');
const dotenv = require('dotenv');
dotenv.config();

const seed = async () => {
  await initDB();
  console.log('Seeding database...');

  // Users
  const adminId = uuidv4();
  const techId = uuidv4();
  const inspectorId = uuidv4();
  const now = new Date().toISOString();
  
  const salt = bcrypt.genSaltSync(10);
  
  const atharvId = uuidv4();
  const users = [
    { id: adminId, name: 'Atharv Khot (Admin)', email: 'atharvkhot@trolley.com', password: bcrypt.hashSync('admin123', salt), role: 'ADMIN' },
    { id: techId, name: 'Tech User', email: 'tech@trolley.com', password: bcrypt.hashSync('tech123', salt), role: 'TECHNICIAN' },
    { id: inspectorId, name: 'Inspector User', email: 'inspector@trolley.com', password: bcrypt.hashSync('inspect123', salt), role: 'INSPECTOR' },
    { id: atharvId, name: 'Atharv', email: 'atharvkhot3@gmail.com', password: bcrypt.hashSync('@1234', salt), role: 'ADMIN' }
  ];

  const userSql = 'INSERT OR IGNORE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)';
  users.forEach(u => runQuery(userSql, [u.id, u.name, u.email, u.password, u.role, now]));

  // Trolleys
  const trolleys = [];
  const zones = ['Zone A Assembly', 'Zone B Paint', 'Zone C Storage', 'Zone D Shipping'];
  const statuses = ['ACTIVE', 'UNDER_MAINTENANCE', 'RETIRED'];
  const conditions = ['GOOD', 'FAIR', 'POOR', 'CRITICAL'];

  const trolleySql = `
    INSERT OR IGNORE INTO trolleys (id, trolley_code, location, status, condition, manufactured_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (let i = 1; i <= 10; i++) {
    const trolleyId = uuidv4();
    const code = `TRL-${String(i).padStart(3, '0')}`;
    const location = zones[Math.floor(Math.random() * zones.length)];
    const status = statuses[Math.floor(Math.random() * 3)];
    const condition = conditions[Math.floor(Math.random() * 4)];
    const mDate = new Date();
    mDate.setFullYear(mDate.getFullYear() - Math.floor(Math.random() * 5));

    trolleys.push(trolleyId);
    runQuery(trolleySql, [trolleyId, code, location, status, condition, mDate.toISOString(), now, now]);
  }

  // Maintenance Logs
  const logTypes = ['REPAIR', 'INSPECTION', 'CLEANING', 'REPLACEMENT'];
  const logSql = `
    INSERT INTO maintenance_logs (id, trolley_id, performed_by, type, description, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  for (let i = 0; i < 15; i++) {
    const trolleyId = trolleys[Math.floor(Math.random() * trolleys.length)];
    const type = logTypes[Math.floor(Math.random() * logTypes.length)];
    runQuery(logSql, [uuidv4(), trolleyId, techId, type, `Routine ${type} performed`, 'COMPLETED', now]);
  }

  // Issues
  const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const issueSql = `
    INSERT INTO issues (id, trolley_id, reported_by, title, description, severity, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (let i = 0; i < 5; i++) {
    const trolleyId = trolleys[Math.floor(Math.random() * trolleys.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    runQuery(issueSql, [uuidv4(), trolleyId, inspectorId, `Issue with wheel`, `Wheel is stuck on trolley`, severity, 'OPEN', now]);
  }

  // Schedules
  const scheduleSql = `
    INSERT INTO maintenance_schedules (id, trolley_id, maintenance_type, frequency_days, next_due_date, assigned_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  for (let i = 0; i < 5; i++) {
    const trolleyId = trolleys[Math.floor(Math.random() * trolleys.length)];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + Math.floor(Math.random() * 30));
    runQuery(scheduleSql, [uuidv4(), trolleyId, 'INSPECTION', 30, nextDate.toISOString().split('T')[0], techId, now]);
  }

  await saveDB();
  console.log('Seeding completed.');
};

seed();
