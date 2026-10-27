const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { initDB, runQuery, saveDB } = require('./database');
const dotenv = require('dotenv');
dotenv.config();

const seed = async () => {
  await initDB();
  console.log('Seeding database...');

  const now = new Date().toISOString();
  const salt = bcrypt.genSaltSync(10);

  // Users
  const adminId = uuidv4();
  const techId = uuidv4();
  const inspectorId = uuidv4();
  const atharvId = uuidv4();

  const users = [
    { id: adminId, name: 'Atharv Khot (Admin)', email: 'atharvkhot@trolley.com', password: bcrypt.hashSync('admin123', salt), role: 'ADMIN' },
    { id: techId, name: 'Tech User', email: 'tech@trolley.com', password: bcrypt.hashSync('tech123', salt), role: 'TECHNICIAN' },
    { id: inspectorId, name: 'Inspector User', email: 'inspector@trolley.com', password: bcrypt.hashSync('inspect123', salt), role: 'INSPECTOR' },
    { id: atharvId, name: 'Atharv', email: 'atharvkhot3@gmail.com', password: bcrypt.hashSync('@1234', salt), role: 'ADMIN' }
  ];

  const userSql = 'INSERT OR IGNORE INTO users (id, name, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)';
  for (const u of users) {
    await runQuery(userSql, [u.id, u.name, u.email, u.password, u.role, now]);
  }

  // Trolleys: 102 total
  const trolleyDefinitions = [
    // F-1 to F-40
    ...Array.from({ length: 40 }, (_, i) => ({
      code: `F-${i + 1}`,
      location: 'Zone A - Front Bumper',
      status: 'ACTIVE',
      condition: 'GOOD',
      notes: `Front Bumper Carrier Trolley F-${i + 1}`
    })),
    // N-1 to N-30
    ...Array.from({ length: 30 }, (_, i) => ({
      code: `N-${i + 1}`,
      location: 'Zone B - Main Line',
      status: 'ACTIVE',
      condition: 'GOOD',
      notes: `Production Carrier Trolley N-${i + 1}`
    })),
    // R-1 to R-20
    ...Array.from({ length: 20 }, (_, i) => ({
      code: `R-${i + 1}`,
      location: 'Zone C - Rear Bumper',
      status: 'ACTIVE',
      condition: 'GOOD',
      notes: `Rear Bumper Carrier Trolley R-${i + 1}`
    })),
    // H-1 to H-12
    ...Array.from({ length: 12 }, (_, i) => ({
      code: `H-${i + 1}`,
      location: 'Zone D - Heavy Duty',
      status: 'ACTIVE',
      condition: 'GOOD',
      notes: `Heavy Duty Carrier Trolley H-${i + 1}`
    }))
  ];

  const trolleySql = `
    INSERT OR IGNORE INTO trolleys (id, trolley_code, location, status, condition, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  for (const t of trolleyDefinitions) {
    const trolleyId = uuidv4();
    await runQuery(trolleySql, [trolleyId, t.code, t.location, t.status, t.condition, t.notes, now, now]);
  }

  saveDB();
  console.log(`Database seeded successfully with users and ${trolleyDefinitions.length} plant trolleys.`);
};

seed();
