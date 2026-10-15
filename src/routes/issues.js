const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../db/database');
const { generateId } = require('../utils/helpers');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', (req, res) => {
  try {
    const { trolley_id, severity, status } = req.query;
    let query = `
      SELECT i.*, t.trolley_code, u.name as reporter_name
      FROM issues i
      JOIN trolleys t ON i.trolley_id = t.id
      JOIN users u ON i.reported_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (trolley_id) {
      query += ' AND i.trolley_id = ?';
      params.push(trolley_id);
    }
    if (severity) {
      query += ' AND i.severity = ?';
      params.push(severity);
    }
    if (status) {
      query += ' AND i.status = ?';
      params.push(status);
    }

    query += ' ORDER BY i.created_at DESC';

    const issues = queryAll(query, params);
    res.json({ count: issues.length, issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const { trolley_id, title, description, severity, photo_url } = req.body;
    if (!trolley_id || !title || !severity) return res.status(400).json({ error: 'Trolley ID, title, and severity are required' });

    const id = generateId();
    const now = new Date().toISOString();

    runQuery(`
      INSERT INTO issues (id, trolley_id, reported_by, title, description, severity, photo_url, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `, [id, trolley_id, req.user.id, title, description, severity, photo_url, now]);

    if (severity === 'HIGH' || severity === 'CRITICAL') {
        runQuery("UPDATE trolleys SET condition = 'POOR', status = 'UNDER_MAINTENANCE', updated_at = ? WHERE id = ?", [now, trolley_id]);
    }

    res.status(201).json({ id, message: 'Issue reported successfully' });
  } catch (err) {
    console.error('Error reporting issue:', err);
    res.status(500).json({ error: err ? (err.message || String(err)) : 'Failed to report issue' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { status, resolved_by, resolved_at } = req.body;
    
    runQuery(`
      UPDATE issues SET status = COALESCE(?, status), resolved_by = COALESCE(?, resolved_by), resolved_at = COALESCE(?, resolved_at)
      WHERE id = ?
    `, [status, resolved_by, resolved_at, req.params.id]);

    res.json({ message: 'Issue updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const bySeverity = queryAll('SELECT severity, COUNT(*) as count FROM issues GROUP BY severity', []);
    const byStatus = queryAll('SELECT status, COUNT(*) as count FROM issues GROUP BY status', []);
    res.json({ bySeverity, byStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
