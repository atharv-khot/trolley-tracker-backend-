const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../db/database');
const { generateId } = require('../utils/helpers');
const { verifyToken } = require('../middleware/auth');
const { sendMaintenanceAlertEmail } = require('../services/emailService');

router.use(verifyToken);

router.get('/', async (req, res) => {
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

    const logs = await queryAll(query, params);
    res.json({ count: logs.length, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const log = await queryOne(`
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

    await runQuery(`
      INSERT INTO maintenance_logs (id, trolley_id, performed_by, type, description, parts_replaced, before_photo_url, after_photo_url, checklist_json, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, trolley_id, req.user.id, type, description, parts_replaced, before_photo_url, after_photo_url, checklistStr, status || 'COMPLETED', now]);

    // Auto-update trolley based on type and record last service date
    if (type === 'REPAIR' || type === 'REPLACEMENT') {
      await runQuery("UPDATE trolleys SET condition = 'GOOD', status = 'ACTIVE', maintenance_reason = NULL, last_service_date = ?, updated_at = ? WHERE id = ?", [now, now, trolley_id]);
      
      // Auto-resolve any open issues for this trolley
      try {
        await runQuery("UPDATE issues SET status = 'RESOLVED', resolved_by = ?, resolved_at = ? WHERE trolley_id = ? AND status = 'OPEN'", [req.user.id, now, trolley_id]);
      } catch (issueErr) {
        console.warn('[Maintenance] Auto-resolve issues warning:', issueErr.message);
      }
    } else if (type === 'INSPECTION') {
      let defectItems = [];
      if (Array.isArray(checklist_json)) {
        defectItems = checklist_json.filter(i => i.status === 'DEFECT');
      } else if (typeof checklist_json === 'string') {
        try {
          const parsed = JSON.parse(checklist_json);
          if (Array.isArray(parsed)) defectItems = parsed.filter(i => i.status === 'DEFECT');
        } catch (e) {}
      }

      if (defectItems.length > 0) {
        const defectSummary = defectItems.map(d => `${d.name}${d.remarks ? ': ' + d.remarks : ''}`).join('; ');
        const defectReason = `Inspection Defect: ${defectSummary}`;
        await runQuery("UPDATE trolleys SET condition = 'POOR', status = 'UNDER_MAINTENANCE', maintenance_reason = ?, last_service_date = ?, updated_at = ? WHERE id = ?", [defectReason, now, now, trolley_id]);
      } else {
        // Inspection completed with all OK
        await runQuery("UPDATE trolleys SET condition = 'GOOD', status = 'ACTIVE', maintenance_reason = NULL, last_service_date = ?, updated_at = ? WHERE id = ?", [now, now, trolley_id]);
      }
    } else if (type === 'CLEANING') {
      await runQuery("UPDATE trolleys SET status = 'ACTIVE', last_service_date = ?, updated_at = ? WHERE id = ?", [now, now, trolley_id]);
    } else {
      await runQuery("UPDATE trolleys SET last_service_date = ?, updated_at = ? WHERE id = ?", [now, now, trolley_id]);
    }

    // Auto-update or create upcoming maintenance schedule for this trolley (+90 days)
    try {
      const existingSchedule = await queryOne('SELECT * FROM maintenance_schedules WHERE trolley_id = ? AND is_active = 1', [trolley_id]);
      const freqDays = existingSchedule?.frequency_days ? Number(existingSchedule.frequency_days) : 90;
      const nextDue = new Date(Date.now() + freqDays * 24 * 60 * 60 * 1000).toISOString();
      if (existingSchedule) {
        await runQuery('UPDATE maintenance_schedules SET next_due_date = ? WHERE id = ?', [nextDue, existingSchedule.id]);
      } else {
        const schedId = generateId();
        await runQuery(`
          INSERT INTO maintenance_schedules (id, trolley_id, maintenance_type, frequency_days, next_due_date, is_active, created_at)
          VALUES (?, ?, 'ROUTINE_INSPECTION', ?, ?, 1, ?)
        `, [schedId, trolley_id, freqDays, nextDue, now]);
      }
    } catch (schedErr) {
      console.warn('[Maintenance] Auto-update schedule warning:', schedErr.message);
    }

    // Trigger email notification if requested
    let emailResult = null;
    if (trigger_email) {
      try {
        const trolley = await queryOne('SELECT trolley_code FROM trolleys WHERE id = ?', [trolley_id]);
        const performer = await queryOne('SELECT name, email FROM users WHERE id = ?', [req.user.id]);
        
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
    console.error('DEBUG POST /maintenance ERROR:', err);
    res.status(500).json({ error: err ? (err.message || String(err)) : 'Unknown error' });
  }
});

// Dedicated route to trigger or re-send maintenance email report
router.post('/:id/trigger-email', async (req, res) => {
  try {
    const { recipient_email } = req.body;
    const log = await queryOne(`
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

router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    await runQuery("UPDATE maintenance_logs SET status = ? WHERE id = ?", [status, req.params.id]);
    res.json({ message: 'Log updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
