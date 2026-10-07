const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../db/database');
const { generateId } = require('../utils/helpers');
const { verifyToken } = require('../middleware/auth');
const { sendMaintenanceAlertEmail } = require('../services/emailService');

router.use(verifyToken);

router.get('/', (req, res) => {
  try {
    const { trolley_id, type, status, start_date, end_date } = req.query;
    let query = `
      SELECT ml.*, t.trolley_code, u.name as performer_name
      FROM maintenance_logs ml
      JOIN trolleys t ON ml.trolley_id = t.id
      JOIN users u ON ml.performed_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (trolley_id) {
      query += ' AND ml.trolley_id = ?';
      params.push(trolley_id);
    }
    if (type) {
      query += ' AND ml.type = ?';
      params.push(type);
    }
    if (status) {
      query += ' AND ml.status = ?';
      params.push(status);
    }
    if (start_date && end_date) {
      query += ' AND ml.created_at BETWEEN ? AND ?';
      params.push(start_date, end_date);
    }

    query += ' ORDER BY ml.created_at DESC';

    const logs = queryAll(query, params);
    res.json({ count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const log = queryOne(`
      SELECT ml.*, t.trolley_code, u.name as performer_name
      FROM maintenance_logs ml
      JOIN trolleys t ON ml.trolley_id = t.id
      JOIN users u ON ml.performed_by = u.id
      WHERE ml.id = ?
    `, [req.params.id]);
    if (!log) return res.status(404).json({ error: 'Log not found' });
    res.json(log);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      trolley_id,
      type,
      description,
      parts_replaced,
      before_photo_url,
      after_photo_url,
      checklist_json,
      status,
      trigger_email,
      notify_email
    } = req.body;
    if (!trolley_id || !type) return res.status(400).json({ error: 'Trolley ID and Type are required' });

    const id = generateId();
    const now = new Date().toISOString();

    const checklistStr = typeof checklist_json === 'object' ? JSON.stringify(checklist_json) : (checklist_json || null);

    runQuery(`
      INSERT INTO maintenance_logs (id, trolley_id, performed_by, type, description, parts_replaced, before_photo_url, after_photo_url, checklist_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, trolley_id, req.user.id, type, description, parts_replaced, before_photo_url, after_photo_url, checklistStr, status || 'COMPLETED', now]);

    // Auto-update trolley based on type
    if (type === 'REPAIR' || type === 'REPLACEMENT') {
        runQuery("UPDATE trolleys SET condition = 'GOOD', status = 'ACTIVE', updated_at = ? WHERE id = ?", [now, trolley_id]);
    } else if (type === 'CLEANING') {
        runQuery("UPDATE trolleys SET status = 'ACTIVE', updated_at = ? WHERE id = ?", [now, trolley_id]);
    }

    // Trigger email notification if requested
    let emailResult = null;
    if (trigger_email) {
      try {
        const trolley = queryOne('SELECT trolley_code FROM trolleys WHERE id = ?', [trolley_id]);
        const performer = queryOne('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
        
        emailResult = await sendMaintenanceAlertEmail({
          to: notify_email || performer?.email,
          trolleyCode: trolley ? trolley.trolley_code : 'N/A',
          type,
          performerName: performer?.name || req.user.name || 'Technician',
          performerEmail: performer?.email || req.user.email,
          description,
          partsReplaced: parts_replaced,
          checklist: checklist_json,
          createdAt: now
        });
      } catch (emailErr) {
        console.error('Failed triggering maintenance email:', emailErr.message);
        emailResult = { success: false, error: emailErr.message };
      }
    }

    res.status(201).json({
      id,
      message: 'Maintenance log created successfully',
      email_triggered: !!trigger_email,
      email_result: emailResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dedicated route to trigger or re-send maintenance email report
router.post('/:id/trigger-email', async (req, res) => {
  try {
    const { recipient_email } = req.body;
    const log = queryOne(`
      SELECT ml.*, t.trolley_code, u.name as performer_name, u.email as performer_email
      FROM maintenance_logs ml
      JOIN trolleys t ON ml.trolley_id = t.id
      JOIN users u ON ml.performed_by = u.id
      WHERE ml.id = ?
    `, [req.params.id]);

    if (!log) return res.status(404).json({ error: 'Maintenance log not found' });

    let parsedChecklist = [];
    if (log.checklist_json) {
      try {
        parsedChecklist = JSON.parse(log.checklist_json);
      } catch (e) {}
    }

    const emailResult = await sendMaintenanceAlertEmail({
      to: recipient_email || log.performer_email,
      trolleyCode: log.trolley_code,
      type: log.type,
      performerName: log.performer_name,
      performerEmail: log.performer_email,
      description: log.description,
      partsReplaced: log.parts_replaced,
      checklist: parsedChecklist,
      createdAt: log.created_at
    });

    res.json({
      success: true,
      message: `Maintenance report email triggered to ${recipient_email || log.performer_email}`,
      result: emailResult
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { status } = req.body;
    runQuery("UPDATE maintenance_logs SET status = ? WHERE id = ?", [status, req.params.id]);
    res.json({ message: 'Log updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
