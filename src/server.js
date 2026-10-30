const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const path = require('path');
const { initDB, queryOne } = require('./db/database');

// Load env vars
dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(process.env.UPLOAD_DIR || './uploads'));

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Routes
const authRoutes = require('./routes/auth');
const trolleyRoutes = require('./routes/trolleys');
const maintenanceRoutes = require('./routes/maintenance');
const issuesRoutes = require('./routes/issues');
const schedulesRoutes = require('./routes/schedules');
const usersRoutes = require('./routes/users');
const exportRoutes = require('./routes/export');
const reminderRoutes = require('./routes/reminders');
const dashboardRoutes = require('./routes/dashboard');
const { verifyToken } = require('./middleware/auth');

app.use('/api/auth', authRoutes);
app.use('/api/trolleys', trolleyRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/issues', issuesRoutes);
app.use('/api/schedules', schedulesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/export', verifyToken, exportRoutes);
app.use('/api/reminders', verifyToken, reminderRoutes);

// Direct Public Download & Web Portal Routes
const {
  generateTrolleysPDF,
  generateMaintenancePDF,
  generateIssuesPDF,
  generateAllDataPDF
} = require('./services/pdfService');
const { queryAll } = require('./db/database');

app.get('/reports', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plant Reports Portal - Trolley Maintenance Tracker</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background-color: #F8FAFC; color: #0F172A; padding: 16px; max-width: 680px; margin: 0 auto; }
    .header { background: #0F2A4A; color: white; padding: 20px; border-radius: 12px; margin-bottom: 20px; border-bottom: 4px solid #0D9488; }
    .header h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .header p { font-size: 12px; color: #94A3B8; }
    .card { background: white; border-radius: 12px; padding: 18px; margin-bottom: 14px; border: 1px solid #CBD5E1; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
    .card-title { font-size: 15px; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 8px; }
    .card-desc { font-size: 12px; color: #64748B; margin-bottom: 14px; line-height: 1.4; }
    .btn-group { display: flex; gap: 8px; }
    .btn { display: inline-flex; align-items: center; justify-content: center; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; flex: 1; }
    .btn-pdf { background: #DC2626; color: white; }
    .btn-pdf:hover { background: #B91C1C; }
    .btn-excel { background: #16A34A; color: white; }
    .btn-excel:hover { background: #15803D; }
    .master-card { border: 2px solid #818CF8; background: #F5F7FF; }
    .footer { text-align: center; font-size: 11px; color: #94A3B8; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SMART TROLLEY MAINTENANCE TRACKER</h1>
    <p>Plant Equipment Inspection Audit & Report Center</p>
  </div>

  <div class="card">
    <div class="card-title">🛒 Trolley Fleet Inventory Report</div>
    <div class="card-desc">Complete registry of plant bumper carriers, statuses, condition badges, and shop floor locations.</div>
    <div class="btn-group">
      <a href="/download/pdf/trolleys" class="btn btn-pdf">📄 Download PDF</a>
      <a href="/download/excel/trolleys" class="btn btn-excel">📊 Excel (.xlsx)</a>
    </div>
  </div>

  <div class="card">
    <div class="card-title">🔧 Maintenance & Inspection Audit</div>
    <div class="card-desc">Certified 8-point check sheet records, technician logs, replaced parts, and inspection verdicts.</div>
    <div class="btn-group">
      <a href="/download/pdf/maintenance" class="btn btn-pdf">📄 Download PDF</a>
      <a href="/download/excel/maintenance" class="btn btn-excel">📊 Excel (.xlsx)</a>
    </div>
  </div>

  <div class="card">
    <div class="card-title">⚠️ Equipment Breakdowns & Issues</div>
    <div class="card-desc">Shop floor defect records, severity levels (Critical, High, Medium, Low), and repair actions.</div>
    <div class="btn-group">
      <a href="/download/pdf/issues" class="btn btn-pdf">📄 Download PDF</a>
      <a href="/download/excel/issues" class="btn btn-excel">📊 Excel (.xlsx)</a>
    </div>
  </div>

  <div class="card" style="border: 2px solid #2563EB; background: #EFF6FF;">
    <div class="card-title" style="color: #1E40AF;">📊 3-Page Workflow Presentation (.pptx)</div>
    <div class="card-desc">Executive 3-slide guide with mobile screenshots showing Fleet Tracking, 8-Point QR Inspection, and Cloud Reports.</div>
    <div class="btn-group">
      <a href="/download/ppt" class="btn" style="background: #2563EB; color: white;">📥 Download PowerPoint (.pptx)</a>
    </div>
  </div>

  <div class="card master-card">
    <div class="card-title" style="color: #4338CA;">🛡️ Master Plant Audit Report (All Data)</div>
    <div class="card-desc">Complete multi-section executive audit report covering Fleet Inventory, Maintenance Check Sheets, and Breakdown Logs.</div>
    <div class="btn-group">
      <a href="/download/pdf/all" class="btn btn-pdf" style="background: #4338CA;">📄 Download Master PDF</a>
      <a href="/download/excel/all" class="btn btn-excel">📊 Excel (.xlsx)</a>
    </div>
  </div>

  <div class="footer">
    ISO 9001 & IATF 16949 Compliant Record System • Powered by Trolley Tracker Cloud
  </div>
</body>
</html>
  `);
});

app.get('/download/ppt', (req, res) => {
  const fs = require('fs');
  const fileCandidates = [
    path.join(__dirname, '../uploads/Trolley_App_Workflow_Guide.pptx'),
    path.join(__dirname, '../Trolley_App_Workflow_Guide.pptx'),
    path.join(__dirname, '../../Trolley_App_Workflow_Guide.pptx'),
    'C:/Users/athar/Desktop/Trolley_App_Workflow_Guide.pptx'
  ];
  for (const f of fileCandidates) {
    if (fs.existsSync(f)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
      res.setHeader('Content-Disposition', 'attachment; filename="Trolley_App_Workflow_Guide.pptx"');
      return res.sendFile(path.resolve(f));
    }
  }
  res.status(404).send('Presentation file not found');
});

app.get('/download/pdf/:type', async (req, res) => {
  const { type } = req.params;
  try {
    if (type === 'trolleys') {
      const trolleys = await queryAll('SELECT * FROM trolleys ORDER BY trolley_code ASC', []);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=trolleys_report_${Date.now()}.pdf`);
      return generateTrolleysPDF(trolleys, res, { name: 'Plant Manager' });
    }
    if (type === 'maintenance') {
      const logs = await queryAll(`
        SELECT m.*, t.trolley_code, u.name as performed_by_name 
        FROM maintenance_logs m 
        LEFT JOIN trolleys t ON m.trolley_id = t.id 
        LEFT JOIN users u ON m.performed_by = u.id
        ORDER BY m.created_at DESC
      `, []);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=maintenance_audit_${Date.now()}.pdf`);
      return generateMaintenancePDF(logs, res, { name: 'Plant Manager' });
    }
    if (type === 'issues') {
      const issues = await queryAll(`
        SELECT i.*, t.trolley_code, u1.name as reported_by_name, u2.name as resolved_by_name
        FROM issues i
        LEFT JOIN trolleys t ON i.trolley_id = t.id
        LEFT JOIN users u1 ON i.reported_by = u1.id
        LEFT JOIN users u2 ON i.resolved_by = u2.id
        ORDER BY i.created_at DESC
      `, []);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=breakdown_issues_${Date.now()}.pdf`);
      return generateIssuesPDF(issues, res, { name: 'Plant Manager' });
    }
    if (type === 'all') {
      const trolleys = await queryAll('SELECT * FROM trolleys ORDER BY trolley_code ASC', []);
      const logs = await queryAll(`
        SELECT m.*, t.trolley_code, u.name as performed_by_name 
        FROM maintenance_logs m 
        LEFT JOIN trolleys t ON m.trolley_id = t.id 
        LEFT JOIN users u ON m.performed_by = u.id
        ORDER BY m.created_at DESC
      `, []);
      const issues = await queryAll(`
        SELECT i.*, t.trolley_code, u1.name as reported_by_name, u2.name as resolved_by_name
        FROM issues i
        LEFT JOIN trolleys t ON i.trolley_id = t.id
        LEFT JOIN users u1 ON i.reported_by = u1.id
        LEFT JOIN users u2 ON i.resolved_by = u2.id
        ORDER BY i.created_at DESC
      `, []);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=master_plant_audit_${Date.now()}.pdf`);
      return generateAllDataPDF({ trolleys, logs, issues }, res, { name: 'Plant Manager' });
    }
    res.status(404).send('Report type not found');
  } catch (e) {
    res.status(500).send('Error generating PDF report: ' + e.message);
  }
});

const ExcelJS = require('exceljs');

const formatExcelDate = (val) => {
  if (!val) return 'N/A';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return String(val);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return String(val);
  }
};

const formatExcelNextDue = (baseVal, days = 90) => {
  try {
    const base = baseVal ? new Date(baseVal) : new Date();
    if (isNaN(base.getTime())) return 'N/A';
    const next = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    const day = String(next.getDate()).padStart(2, '0');
    const month = String(next.getMonth() + 1).padStart(2, '0');
    const year = next.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (e) {
    return 'N/A';
  }
};

const styleExcelHeader = (ws) => {
  const row = ws.getRow(1);
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' } // Deep Royal Blue
    };
  });
  ws.columns.forEach(column => {
    let max = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const len = cell.value ? cell.value.toString().length : 10;
      if (len > max) max = len;
    });
    column.width = Math.max(12, max + 3);
  });
};

app.get('/download/excel/:type', async (req, res) => {
  const { type } = req.params;
  try {
    const workbook = new ExcelJS.Workbook();
    if (type === 'trolleys' || type === 'all') {
      const trolleys = await queryAll('SELECT * FROM trolleys ORDER BY trolley_code ASC', []);
      const ws = workbook.addWorksheet('Trolleys');
      ws.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Location', key: 'location' },
        { header: 'Status', key: 'status' },
        { header: 'Condition', key: 'condition' },
        { header: 'Last Service Date', key: 'formatted_last_service' },
        { header: 'Upcoming Maintenance Date', key: 'formatted_next_due' },
        { header: 'Registration Date', key: 'formatted_created' },
        { header: 'Notes', key: 'notes' }
      ];
      trolleys.forEach(t => {
        ws.addRow({
          ...t,
          formatted_last_service: formatExcelDate(t.last_service_date || t.updated_at || t.created_at),
          formatted_next_due: formatExcelNextDue(t.last_service_date || t.updated_at || t.created_at, 90),
          formatted_created: formatExcelDate(t.created_at)
        });
      });
      styleExcelHeader(ws);
    }
    if (type === 'maintenance' || type === 'all') {
      const logs = await queryAll(`
        SELECT m.*, t.trolley_code, u.name as performed_by_name 
        FROM maintenance_logs m 
        LEFT JOIN trolleys t ON m.trolley_id = t.id 
        LEFT JOIN users u ON m.performed_by = u.id
        ORDER BY m.created_at DESC
      `, []);
      const ws = workbook.addWorksheet('Maintenance');
      ws.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Maintenance Date', key: 'formatted_date' },
        { header: 'Service Type', key: 'type' },
        { header: 'Technician', key: 'performed_by_name' },
        { header: 'Parts Replaced', key: 'parts_replaced' },
        { header: 'Status', key: 'status' },
        { header: 'Description / Remarks', key: 'description' }
      ];
      logs.forEach(l => {
        ws.addRow({
          ...l,
          formatted_date: formatExcelDate(l.created_at)
        });
      });
      styleExcelHeader(ws);
    }
    if (type === 'issues' || type === 'all') {
      const issues = await queryAll(`
        SELECT i.*, t.trolley_code, u.name as reported_by_name, u2.name as resolved_by_name
        FROM issues i
        LEFT JOIN trolleys t ON i.trolley_id = t.id
        LEFT JOIN users u ON i.reported_by = u.id
        LEFT JOIN users u2 ON i.resolved_by = u2.id
        ORDER BY i.created_at DESC
      `, []);
      const ws = workbook.addWorksheet('Issues');
      ws.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Reported Date', key: 'formatted_date' },
        { header: 'Issue Title', key: 'title' },
        { header: 'Severity', key: 'severity' },
        { header: 'Status', key: 'status' },
        { header: 'Reported By', key: 'reported_by_name' },
        { header: 'Resolved Date', key: 'formatted_resolved_date' },
        { header: 'Description', key: 'description' }
      ];
      issues.forEach(i => {
        ws.addRow({
          ...i,
          formatted_date: formatExcelDate(i.created_at),
          formatted_resolved_date: formatExcelDate(i.resolved_at)
        });
      });
      styleExcelHeader(ws);
    }
    if (type === 'schedules' || type === 'all') {
      const schedules = await queryAll(`
        SELECT s.*, t.trolley_code, u.name as assigned_to_name
        FROM maintenance_schedules s
        LEFT JOIN trolleys t ON s.trolley_id = t.id
        LEFT JOIN users u ON s.assigned_to = u.id
        WHERE s.is_active = 1
        ORDER BY s.next_due_date ASC
      `, []);
      const ws = workbook.addWorksheet('Schedules');
      ws.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Upcoming Maintenance Date', key: 'formatted_next_due' },
        { header: 'Maintenance Type', key: 'maintenance_type' },
        { header: 'Frequency (Days)', key: 'frequency_days' },
        { header: 'Scheduled Date', key: 'formatted_created' },
        { header: 'Assigned To', key: 'assigned_to_name' },
        { header: 'Status', key: 'status_label' }
      ];
      schedules.forEach(s => {
        ws.addRow({
          ...s,
          formatted_next_due: formatExcelDate(s.next_due_date),
          formatted_created: formatExcelDate(s.created_at),
          status_label: s.is_active ? 'ACTIVE' : 'INACTIVE'
        });
      });
      styleExcelHeader(ws);
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${type}_export_${Date.now()}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).send('Error generating Excel report: ' + e.message);
  }
});

app.post('/api/upload', upload.single('photo'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  res.json({ url: `/${req.file.filename}` });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something broke!' });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDB();
  
  app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    
    try {
      const now = new Date().toISOString();
      const overdue = await queryOne(`
        SELECT COUNT(*) as count FROM maintenance_schedules
        WHERE is_active = 1 AND next_due_date < ?
      `, [now]);
      
      const count = Number(overdue?.count || 0);
      if (count > 0) {
        console.log(`[REMINDER] You have ${count} overdue maintenance schedule(s)!`);
      } else {
        console.log(`[REMINDER] No overdue maintenance schedules.`);
      }
    } catch (err) {
      console.error('Failed to check overdue reminders on startup:', err);
    }
  });
}

startServer();
