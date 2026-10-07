const express = require('express');
const router = express.Router();
const { queryAll, queryOne } = require('../db/database');
const { verifyToken } = require('../middleware/auth');

router.use(verifyToken);

router.get('/stats', (req, res) => {
  try {
    const totalRow = queryOne('SELECT COUNT(*) as count FROM trolleys', []);
    const activeRow = queryOne("SELECT COUNT(*) as count FROM trolleys WHERE status = 'ACTIVE'", []);
    const underMaintRow = queryOne("SELECT COUNT(*) as count FROM trolleys WHERE status = 'UNDER_MAINTENANCE'", []);
    const retiredRow = queryOne("SELECT COUNT(*) as count FROM trolleys WHERE status = 'RETIRED'", []);

    const goodRow = queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'GOOD'", []);
    const fairRow = queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'FAIR'", []);
    const poorRow = queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'POOR'", []);
    const criticalRow = queryOne("SELECT COUNT(*) as count FROM trolleys WHERE condition = 'CRITICAL'", []);

    const today = new Date().toISOString().split('T')[0];
    const overdueRow = queryOne("SELECT COUNT(*) as count FROM maintenance_schedules WHERE next_due_date < ? AND is_active = 1", [today]);
    const openIssuesRow = queryOne("SELECT COUNT(*) as count FROM issues WHERE status IN ('OPEN', 'IN_PROGRESS')", []);

    res.json({
      total_trolleys: totalRow?.count || 0,
      active: activeRow?.count || 0,
      under_maintenance: underMaintRow?.count || 0,
      retired: retiredRow?.count || 0,
      condition_good: goodRow?.count || 0,
      condition_fair: fairRow?.count || 0,
      condition_poor: poorRow?.count || 0,
      condition_critical: criticalRow?.count || 0,
      overdue_maintenance: overdueRow?.count || 0,
      open_issues: openIssuesRow?.count || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
