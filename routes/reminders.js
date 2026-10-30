const express = require('express');
const router = express.Router();
const { queryAll, runQuery } = require('../db/database');
const { verifyToken } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');

router.get('/check', verifyToken, async (req, res) => {
  try {
    // Check trolleys that don't have an active schedule
    const trolleysWithoutSchedule = await queryAll(`
      SELECT t.* FROM trolleys t
      LEFT JOIN maintenance_schedules s ON t.id = s.trolley_id AND s.is_active = 1
      WHERE s.id IS NULL
    `, []);
    
    res.json({ count: trolleysWithoutSchedule.length, trolleys: trolleysWithoutSchedule });
  } catch (error) {
    console.error('Check reminders error:', error);
    res.status(500).json({ error: 'Failed to check reminders' });
  }
});

router.post('/setup-all', verifyToken, async (req, res) => {
  try {
    // Check trolleys that don't have an active schedule
    const trolleysWithoutSchedule = await queryAll(`
      SELECT t.id FROM trolleys t
      LEFT JOIN maintenance_schedules s ON t.id = s.trolley_id AND s.is_active = 1
      WHERE s.id IS NULL
    `, []);
    
    const insertScheduleSql = `
      INSERT INTO maintenance_schedules (id, trolley_id, maintenance_type, frequency_days, next_due_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    
    const now = new Date();
    const nextDueDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const nextDueDateStr = nextDueDate.toISOString();
    const nowStr = now.toISOString();
    
    for (const trolley of trolleysWithoutSchedule) {
      await runQuery(insertScheduleSql, [uuidv4(), trolley.id, 'ROUTINE_INSPECTION', 90, nextDueDateStr, nowStr]);
    }
    
    res.json({ message: 'Set up 3-month recurring maintenance reminders for all trolleys', count: trolleysWithoutSchedule.length });
  } catch (error) {
    console.error('Setup all reminders error:', error);
    res.status(500).json({ error: 'Failed to setup reminders' });
  }
});

router.get('/due', verifyToken, async (req, res) => {
  try {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const dueSchedules = await queryAll(`
      SELECT s.*, t.trolley_code 
      FROM maintenance_schedules s
      JOIN trolleys t ON s.trolley_id = t.id
      WHERE s.is_active = 1 AND s.next_due_date <= ? AND s.next_due_date >= ?
    `, [next7Days.toISOString(), now.toISOString()]);
    
    res.json(dueSchedules);
  } catch (error) {
    console.error('Due reminders error:', error);
    res.status(500).json({ error: 'Failed to get due reminders' });
  }
});

router.get('/overdue', verifyToken, async (req, res) => {
  try {
    const now = new Date().toISOString();
    
    const overdueSchedules = await queryAll(`
      SELECT s.*, t.trolley_code 
      FROM maintenance_schedules s
      JOIN trolleys t ON s.trolley_id = t.id
      WHERE s.is_active = 1 AND s.next_due_date < ?
    `, [now]);
    
    res.json(overdueSchedules);
  } catch (error) {
    console.error('Overdue reminders error:', error);
    res.status(500).json({ error: 'Failed to get overdue reminders' });
  }
});

module.exports = router;
