const express = require('express');
const router = express.Router();
const { queryAll, runQuery } = require('../db/database');
const { generateId } = require('../utils/helpers');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

// Get all active schedules with trolley details
router.get('/', async (req, res) => {
  try {
    const schedules = await queryAll(`
      SELECT ms.*, t.trolley_code, t.location, t.condition, t.status, t.last_service_date, u.name as assignee_name
      FROM maintenance_schedules ms
      JOIN trolleys t ON ms.trolley_id = t.id
      LEFT JOIN users u ON ms.assigned_to = u.id
      WHERE ms.is_active = 1
      ORDER BY ms.next_due_date ASC
    `, []);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get upcoming schedules (all active schedules with next_due_date >= now)
router.get('/upcoming', async (req, res) => {
  try {
    const nowStr = new Date().toISOString();
    const schedules = await queryAll(`
      SELECT ms.*, t.trolley_code, t.location, t.condition, t.status, t.last_service_date, u.name as assignee_name
      FROM maintenance_schedules ms
      JOIN trolleys t ON ms.trolley_id = t.id
      LEFT JOIN users u ON ms.assigned_to = u.id
      WHERE ms.is_active = 1 AND ms.next_due_date >= ?
      ORDER BY ms.next_due_date ASC
    `, [nowStr]);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get overdue schedules (all active schedules with next_due_date < now)
router.get('/overdue', async (req, res) => {
  try {
    const nowStr = new Date().toISOString();
    const schedules = await queryAll(`
      SELECT ms.*, t.trolley_code, t.location, t.condition, t.status, t.last_service_date, u.name as assignee_name
      FROM maintenance_schedules ms
      JOIN trolleys t ON ms.trolley_id = t.id
      LEFT JOIN users u ON ms.assigned_to = u.id
      WHERE ms.is_active = 1 AND ms.next_due_date < ?
      ORDER BY ms.next_due_date ASC
    `, [nowStr]);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update upcoming maintenance schedule for a trolley
router.post('/', async (req, res) => {
  try {
    const { trolley_id, maintenance_type, frequency_days, next_due_date, assigned_to } = req.body;
    if (!trolley_id || !next_due_date) {
      return res.status(400).json({ error: 'trolley_id and next_due_date are required' });
    }

    const id = generateId();
    const now = new Date().toISOString();
    let formattedDueDate;
    try {
      formattedDueDate = new Date(next_due_date).toISOString();
    } catch (e) {
      formattedDueDate = next_due_date;
    }

    // Deactivate previous active schedules for this trolley to maintain clean single schedule
    await runQuery('UPDATE maintenance_schedules SET is_active = 0 WHERE trolley_id = ?', [trolley_id]);

    await runQuery(`
      INSERT INTO maintenance_schedules (id, trolley_id, maintenance_type, frequency_days, next_due_date, assigned_to, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)
    `, [
      id,
      trolley_id,
      maintenance_type || 'ROUTINE_INSPECTION',
      Number(frequency_days) || 90,
      formattedDueDate,
      assigned_to || null,
      now
    ]);

    const created = await queryOne(`
      SELECT ms.*, t.trolley_code, t.location, t.condition, t.status, t.last_service_date
      FROM maintenance_schedules ms
      JOIN trolleys t ON ms.trolley_id = t.id
      WHERE ms.id = ?
    `, [id]);

    res.status(201).json({ id, message: 'Upcoming maintenance schedule saved successfully', schedule: created });
  } catch (err) {
    console.error('Error creating schedule:', err);
    res.status(500).json({ error: err ? (err.message || String(err)) : 'Failed to create schedule' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { maintenance_type, frequency_days, next_due_date, assigned_to } = req.body;
    let formattedDueDate = null;
    if (next_due_date) {
      try {
        formattedDueDate = new Date(next_due_date).toISOString();
      } catch (e) {
        formattedDueDate = next_due_date;
      }
    }

    await runQuery(`
      UPDATE maintenance_schedules 
      SET maintenance_type = COALESCE(?, maintenance_type), 
          frequency_days = COALESCE(?, frequency_days), 
          next_due_date = COALESCE(?, next_due_date), 
          assigned_to = COALESCE(?, assigned_to)
      WHERE id = ?
    `, [maintenance_type, frequency_days, formattedDueDate, assigned_to, req.params.id]);

    const updated = await queryOne(`
      SELECT ms.*, t.trolley_code, t.location, t.condition, t.status, t.last_service_date
      FROM maintenance_schedules ms
      JOIN trolleys t ON ms.trolley_id = t.id
      WHERE ms.id = ?
    `, [req.params.id]);

    res.json({ message: 'Schedule updated successfully', schedule: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await runQuery("UPDATE maintenance_schedules SET is_active = 0 WHERE id = ?", [req.params.id]);
    res.json({ message: 'Schedule deactivated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
