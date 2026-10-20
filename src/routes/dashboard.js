const express = require('express');
const router = express.Router();
const { queryOne } = require('../db/database');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/stats', async (req, res) => {
  try {
    const totalRow = await queryOne('SELECT COUNT(*) as count FROM trolleys', []);
    const activeRow = await queryOne("SELECT COUNT(*) as count FROM trolleys WHERE status = 'ACTIVE'", []);
    const underMaintRow = await queryOne("SELECT COUNT(*) as count FROM trolleys WHERE status = 'UNDER_MAINTENANCE'", []);
    const retiredRow = await queryOne("SELECT COUNT(*) as count FROM trolleys WHERE status = 'RETIRED'", []);

    const goodRow = await queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'GOOD'", []);
    const fairRow = await queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'FAIR'", []);
    const poorRow = await queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'POOR'", []);
    const criticalRow = await queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'CRITICAL'", []);

    const today = new Date().toISOString().split('T')[0];
    const overdueRow = await queryOne("SELECT COUNT(*) as count FROM maintenance_schedules WHERE next_due_date < ? AND is_active = 1", [today]);
    const openIssuesRow = await queryOne("SELECT COUNT(*) as count FROM issues WHERE status IN ('OPEN', 'IN_PROGRESS')", []);

    res.json({
      total_trolleys: Number(totalRow?.count || 0),
      active: Number(activeRow?.count || 0),
      under_maintenance: Number(underMaintRow?.count || 0),
      retired: Number(retiredRow?.count || 0),
      condition_good: Number(goodRow?.count || 0),
      condition_fair: Number(fairRow?.count || 0),
      condition_poor: Number(poorRow?.count || 0),
      condition_critical: Number(criticalRow?.count || 0),
      overdue_maintenance: Number(overdueRow?.count || 0),
      open_issues: Number(openIssuesRow?.count || 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
