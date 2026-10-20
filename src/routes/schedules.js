const express = require('express');
const router = express.Router();
const { queryAll, runQuery } = require('../db/database');
const { generateId } = require('../utils/helpers');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/', async (req, res) => {
  try {
    const schedules = await queryAll(`
      SELECT ms.*, t.trolley_code, u.name as assignee_name
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

router.get('/upcoming', async (req, res) => {
  try {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const dateStr = nextWeek.toISOString().split('T')[0];

    const schedules = await queryAll(`
      SELECT ms.*, t.trolley_code, u.name as assignee_name
      FROM maintenance_schedules ms
      JOIN trolleys t ON ms.trolley_id = t.id
      LEFT JOIN users u ON ms.assigned_to = u.id
      WHERE ms.is_active = 1 AND ms.next_due_date <= ? AND ms.next_due_date >= CURRENT_DATE
      ORDER BY ms.next_due_date ASC
    `, [dateStr]);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/overdue', async (req, res) => {
  try {
    const schedules = await queryAll(`
      SELECT ms.*, t.trolley_code, u.name as assignee_name
      FROM maintenance_schedules ms
      JOIN trolleys t ON ms.trolley_id = t.id
      LEFT JOIN users u ON ms.assigned_to = u.id
      WHERE ms.is_active = 1 AND ms.next_due_date < CURRENT_DATE
      ORDER BY ms.next_due_date ASC
    `, []);
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { trolley_id, maintenance_type, frequency_days, next_due_date, assigned_to } = req.body;
    if (!trolley_id || !maintenance_type || !frequency_days || !next_due_date) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    const id = generateId();
    const now = new Date().toISOString();

    await runQuery(`
      INSERT INTO maintenance_schedules (id, trolley_id, maintenance_type, frequency_days, next_due_date, assigned_to, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [id, trolley_id, maintenance_type, frequency_days, next_due_date, assigned_to, now]);

    res.status(201).json({ id, message: 'Schedule created successfully' });
  } catch (err) {
    console.error('Error creating schedule:', err);
    res.status(500).json({ error: err ? (err.message || String(err)) : 'Failed to create schedule' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { maintenance_type, frequency_days, next_due_date, assigned_to } = req.body;

    await runQuery(`
      UPDATE maintenance_schedules 
      SET maintenance_type = COALESCE(?, maintenance_type), 
          frequency_days = COALESCE(?, frequency_days), 
          next_due_date = COALESCE(?, next_due_date), 
          assigned_to = COALESCE(?, assigned_to)
      WHERE id = ?
    `, [maintenance_type, frequency_days, next_due_date, assigned_to, req.params.id]);

    res.json({ message: 'Schedule updated successfully' });
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
