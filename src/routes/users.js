const express = require('express');
const router = express.Router();
const { queryAll, queryOne, runQuery } = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireRole('ADMIN'));

router.get('/', async (req, res) => {
  try {
    const users = await queryAll('SELECT id, name, email, role, is_active, created_at FROM users', []);
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await queryOne('SELECT id, name, email, role, is_active, created_at FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, role, is_active } = req.body;

    await runQuery(`
      UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), is_active = COALESCE(?, is_active)
      WHERE id = ?
    `, [name, role, is_active, req.params.id]);

    res.json({ message: 'User updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/activity', async (req, res) => {
  try {
    const activity = await queryAll(`
      SELECT u.id, u.name,
             (SELECT COUNT(*) FROM maintenance_logs WHERE performed_by = u.id) as maintenance_count,
             (SELECT COUNT(*) FROM issues WHERE reported_by = u.id) as issues_reported
      FROM users u
    `, []);
    res.json(activity);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
