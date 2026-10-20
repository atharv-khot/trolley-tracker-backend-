const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../db/database');
const { generateId } = require('../utils/helpers');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
  try {
    const { q, status, condition, location } = req.query;
    let query = 'SELECT * FROM trolleys WHERE 1=1';
    const params = [];

    if (q) {
      query += ' AND (trolley_code LIKE ? OR notes LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    if (condition) {
      query += ' AND condition = ?';
      params.push(condition);
    }
    if (location) {
      query += ' AND location = ?';
      params.push(location);
    }

    query += ' ORDER BY updated_at DESC';

    const trolleys = await queryAll(query, params);
    res.json({ count: trolleys.length, trolleys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const trolley = await queryOne('SELECT * FROM trolleys WHERE id = ?', [req.params.id]);
    if (!trolley) return res.status(404).json({ error: 'Trolley not found' });

    const recentLogs = await queryAll('SELECT * FROM maintenance_logs WHERE trolley_id = ? ORDER BY created_at DESC LIMIT 5', [trolley.id]);
    const recentIssues = await queryAll('SELECT * FROM issues WHERE trolley_id = ? ORDER BY created_at DESC LIMIT 5', [trolley.id]);

    res.json({ ...trolley, recentLogs, recentIssues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/code/:code', async (req, res) => {
  try {
    let cleanCode = (req.params.code || '').trim();
    if (cleanCode.includes('/')) {
      const parts = cleanCode.split('/');
      cleanCode = parts[parts.length - 1];
    }
    // Try exact case-insensitive match
    let trolley = await queryOne('SELECT * FROM trolleys WHERE UPPER(trolley_code) = UPPER(?)', [cleanCode]);
    // Try LIKE match if not found directly
    if (!trolley) {
      trolley = await queryOne('SELECT * FROM trolleys WHERE UPPER(trolley_code) LIKE UPPER(?)', [`%${cleanCode}%`]);
    }
    if (!trolley) return res.status(404).json({ error: 'Trolley not found' });
    res.json(trolley);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireRole('ADMIN', 'TECHNICIAN'), async (req, res) => {
  try {
    const { trolley_code, location, status, condition, photo_url, manufactured_date, notes } = req.body;
    if (!trolley_code) return res.status(400).json({ error: 'Trolley code is required' });

    const id = generateId();
    const now = new Date().toISOString();

    await runQuery(`
      INSERT INTO trolleys (id, trolley_code, location, status, condition, photo_url, manufactured_date, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, trolley_code, location, status || 'ACTIVE', condition || 'GOOD', photo_url, manufactured_date, notes, now, now]);

    res.status(201).json({ id, message: 'Trolley created successfully' });
  } catch (err) {
    if (err && (err.code === '23505' || (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate key'))))) {
      return res.status(400).json({ error: 'Trolley code already exists' });
    }
    res.status(500).json({ error: err ? (err.message || String(err)) : 'Failed to create trolley' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { location, status, condition, photo_url, notes } = req.body;
    const now = new Date().toISOString();

    const trolley = await queryOne('SELECT id FROM trolleys WHERE id = ?', [req.params.id]);
    if (!trolley) return res.status(404).json({ error: 'Trolley not found' });

    await runQuery(`
      UPDATE trolleys SET location = COALESCE(?, location), status = COALESCE(?, status),
      condition = COALESCE(?, condition), photo_url = COALESCE(?, photo_url),
      notes = COALESCE(?, notes), updated_at = ? WHERE id = ?
    `, [location, status, condition, photo_url, notes, now, req.params.id]);

    res.json({ message: 'Trolley updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    await runQuery("UPDATE trolleys SET status = 'RETIRED', updated_at = ? WHERE id = ?", [new Date().toISOString(), req.params.id]);
    res.json({ message: 'Trolley retired successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
