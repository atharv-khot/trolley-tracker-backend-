const express = require('express');
const router = express.Router();
const { queryAll, runQuery } = require('../db/database');
const { generateId } = require('../utils/helpers');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
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

    const issues = await queryAll(query, params);
    res.json({ count: issues.length, issues });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { trolley_id, title, description, severity, photo_url } = req.body;
    if (!trolley_id || !title || !severity) return res.status(400).json({ error: 'Trolley ID, title, and severity are required' });

    const id = generateId();
    const now = new Date().toISOString();

    await runQuery(`
      INSERT INTO issues (id, trolley_id, reported_by, title, description, severity, photo_url, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)
    `, [id, trolley_id, req.user.id, title, description, severity, photo_url, now]);

    const reason = description ? `${title}: ${description}` : title;
    const cond = severity === 'CRITICAL' ? 'CRITICAL' : (severity === 'LOW' ? 'FAIR' : 'POOR');

    // Any reported issue grounds the trolley under maintenance with reason
    await runQuery(
      "UPDATE trolleys SET condition = ?, status = 'UNDER_MAINTENANCE', maintenance_reason = ?, updated_at = ? WHERE id = ?",
      [cond, reason, now, trolley_id]
    );

    res.status(201).json({ id, message: 'Issue reported successfully' });
  } catch (err) {
    console.error('Error reporting issue:', err);
    res.status(500).json({ error: err ? (err.message || String(err)) : 'Failed to report issue' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { status, resolved_by, resolved_at } = req.body;
    const now = new Date().toISOString();
    
    await runQuery(`
      UPDATE issues SET status = COALESCE(?, status), resolved_by = COALESCE(?, resolved_by), resolved_at = COALESCE(?, resolved_at)
      WHERE id = ?
    `, [status, resolved_by || req.user.id, resolved_at || now, req.params.id]);

    // If issue resolved or closed, check if trolley has any other open issues
    if (status === 'RESOLVED' || status === 'CLOSED') {
      const issue = await queryOne('SELECT trolley_id FROM issues WHERE id = ?', [req.params.id]);
      if (issue && issue.trolley_id) {
        const remainingOpen = await queryAll("SELECT id, title, description FROM issues WHERE trolley_id = ? AND status = 'OPEN' AND id != ?", [issue.trolley_id, req.params.id]);
        if (!remainingOpen || remainingOpen.length === 0) {
          await runQuery("UPDATE trolleys SET status = 'ACTIVE', condition = 'GOOD', maintenance_reason = NULL, updated_at = ? WHERE id = ?", [now, issue.trolley_id]);
        } else {
          // Update reason to the remaining open issue
          const nextReason = remainingOpen[0].description ? `${remainingOpen[0].title}: ${remainingOpen[0].description}` : remainingOpen[0].title;
          await runQuery("UPDATE trolleys SET maintenance_reason = ?, updated_at = ? WHERE id = ?", [nextReason, now, issue.trolley_id]);
        }
      }
    }

    res.json({ message: 'Issue updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const bySeverity = await queryAll('SELECT severity, COUNT(*) as count FROM issues GROUP BY severity', []);
    const byStatus = await queryAll('SELECT status, COUNT(*) as count FROM issues GROUP BY status', []);
    res.json({ bySeverity, byStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
