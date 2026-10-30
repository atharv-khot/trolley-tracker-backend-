const express = require('express');
const router = express.Router();
const { queryAll } = require('../db/database');
const { verifyToken } = require('../middleware/auth');
const ExcelJS = require('exceljs');
const {
  generateTrolleysPDF,
  generateMaintenancePDF,
  generateIssuesPDF,
  generateAllDataPDF
} = require('../services/pdfService');

const styleHeader = (worksheet) => {
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0000FF' }
    };
  });
  worksheet.columns.forEach(column => {
    let maxLength = 0;
    column.eachCell({ includeEmpty: true }, cell => {
      const columnLength = cell.value ? cell.value.toString().length : 10;
      if (columnLength > maxLength) {
        maxLength = columnLength;
      }
    });
    column.width = maxLength < 10 ? 10 : maxLength + 2;
  });
};

const formatDate = (val) => {
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

const formatNextDue = (baseVal, days = 90) => {
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

// --- 1. TROLLEYS EXPORT (PDF by default, or ?format=excel) ---
const handleTrolleysExport = async (req, res) => {
  try {
    const trolleys = await queryAll('SELECT * FROM trolleys ORDER BY trolley_code ASC', []);
    const format = (req.query.format || (req.path.endsWith('/excel') ? 'excel' : 'pdf')).toLowerCase();

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Trolleys');
      
      worksheet.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Location', key: 'location' },
        { header: 'Status', key: 'status' },
        { header: 'Condition', key: 'condition' },
        { header: 'Last Service Date', key: 'formatted_last_service' },
        { header: 'Upcoming Maintenance Date', key: 'formatted_next_due' },
        { header: 'Registration Date', key: 'formatted_created' },
        { header: 'Manufactured Date', key: 'formatted_manufactured' },
        { header: 'Notes', key: 'notes' }
      ];
      
      trolleys.forEach(t => {
        worksheet.addRow({
          ...t,
          formatted_last_service: formatDate(t.last_service_date || t.updated_at || t.created_at),
          formatted_next_due: formatNextDue(t.last_service_date || t.updated_at || t.created_at, 90),
          formatted_created: formatDate(t.created_at),
          formatted_manufactured: formatDate(t.manufactured_date)
        });
      });
      styleHeader(worksheet);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=trolleys_export_${Date.now()}.xlsx`);
      
      await workbook.xlsx.write(res);
      return res.end();
    }

    // Default: High quality branded PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=trolleys_report_${Date.now()}.pdf`);
    generateTrolleysPDF(trolleys, res, req.user);
  } catch (error) {
    console.error('Export trolleys error:', error);
    res.status(500).json({ error: 'Failed to export trolleys' });
  }
};

router.get('/trolleys', verifyToken, handleTrolleysExport);
router.get('/trolleys/pdf', verifyToken, (req, res) => { req.query.format = 'pdf'; handleTrolleysExport(req, res); });
router.get('/trolleys/excel', verifyToken, (req, res) => { req.query.format = 'excel'; handleTrolleysExport(req, res); });

// --- 2. MAINTENANCE EXPORT ---
const handleMaintenanceExport = async (req, res) => {
  try {
    const logs = await queryAll(`
      SELECT m.*, t.trolley_code, u.name as performed_by_name 
      FROM maintenance_logs m 
      LEFT JOIN trolleys t ON m.trolley_id = t.id 
      LEFT JOIN users u ON m.performed_by = u.id
      ORDER BY m.created_at DESC
    `, []);
    const format = (req.query.format || (req.path.endsWith('/excel') ? 'excel' : 'pdf')).toLowerCase();

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Maintenance');
      
      worksheet.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Maintenance Date', key: 'formatted_date' },
        { header: 'Service Type', key: 'type' },
        { header: 'Technician', key: 'performed_by_name' },
        { header: 'Parts Replaced', key: 'parts_replaced' },
        { header: 'Status', key: 'status' },
        { header: 'Description / Remarks', key: 'description' }
      ];
      
      logs.forEach(l => {
        worksheet.addRow({
          ...l,
          formatted_date: formatDate(l.created_at)
        });
      });
      styleHeader(worksheet);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=maintenance_export_${Date.now()}.xlsx`);
      
      await workbook.xlsx.write(res);
      return res.end();
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=maintenance_report_${Date.now()}.pdf`);
    generateMaintenancePDF(logs, res, req.user);
  } catch (error) {
    console.error('Export maintenance error:', error);
    res.status(500).json({ error: 'Failed to export maintenance logs' });
  }
};

router.get('/maintenance', verifyToken, handleMaintenanceExport);
router.get('/maintenance/pdf', verifyToken, (req, res) => { req.query.format = 'pdf'; handleMaintenanceExport(req, res); });
router.get('/maintenance/excel', verifyToken, (req, res) => { req.query.format = 'excel'; handleMaintenanceExport(req, res); });

// --- 3. ISSUES EXPORT ---
const handleIssuesExport = async (req, res) => {
  try {
    const issues = await queryAll(`
      SELECT i.*, t.trolley_code, u1.name as reported_by_name, u2.name as resolved_by_name
      FROM issues i
      LEFT JOIN trolleys t ON i.trolley_id = t.id
      LEFT JOIN users u1 ON i.reported_by = u1.id
      LEFT JOIN users u2 ON i.resolved_by = u2.id
      ORDER BY i.created_at DESC
    `, []);
    const format = (req.query.format || (req.path.endsWith('/excel') ? 'excel' : 'pdf')).toLowerCase();

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Issues');
      
      worksheet.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Reported Date', key: 'formatted_date' },
        { header: 'Title', key: 'title' },
        { header: 'Severity', key: 'severity' },
        { header: 'Status', key: 'status' },
        { header: 'Reported By', key: 'reported_by_name' },
        { header: 'Resolved By', key: 'resolved_by_name' },
        { header: 'Resolved Date', key: 'formatted_resolved_date' },
        { header: 'Description', key: 'description' }
      ];
      
      issues.forEach(i => {
        worksheet.addRow({
          ...i,
          formatted_date: formatDate(i.created_at),
          formatted_resolved_date: formatDate(i.resolved_at)
        });
      });
      styleHeader(worksheet);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=issues_export_${Date.now()}.xlsx`);
      
      await workbook.xlsx.write(res);
      return res.end();
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=issues_report_${Date.now()}.pdf`);
    generateIssuesPDF(issues, res, req.user);
  } catch (error) {
    console.error('Export issues error:', error);
    res.status(500).json({ error: 'Failed to export issues' });
  }
};

router.get('/issues', verifyToken, handleIssuesExport);
router.get('/issues/pdf', verifyToken, (req, res) => { req.query.format = 'pdf'; handleIssuesExport(req, res); });
router.get('/issues/excel', verifyToken, (req, res) => { req.query.format = 'excel'; handleIssuesExport(req, res); });

// --- 4. ALL DATA MASTER REPORT ---
const handleAllExport = async (req, res) => {
  try {
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

    const format = (req.query.format || (req.path.endsWith('/excel') ? 'excel' : 'pdf')).toLowerCase();

    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      
      // Trolleys Sheet
      const sheetTrolleys = workbook.addWorksheet('Trolleys');
      sheetTrolleys.columns = [
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
        sheetTrolleys.addRow({
          ...t,
          formatted_last_service: formatDate(t.last_service_date || t.updated_at || t.created_at),
          formatted_next_due: formatNextDue(t.last_service_date || t.updated_at || t.created_at, 90),
          formatted_created: formatDate(t.created_at)
        });
      });
      styleHeader(sheetTrolleys);
      
      // Maintenance Sheet
      const sheetMaintenance = workbook.addWorksheet('Maintenance');
      sheetMaintenance.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Maintenance Date', key: 'formatted_date' },
        { header: 'Service Type', key: 'type' },
        { header: 'Technician', key: 'performed_by_name' },
        { header: 'Parts Replaced', key: 'parts_replaced' },
        { header: 'Status', key: 'status' },
        { header: 'Description / Remarks', key: 'description' }
      ];
      logs.forEach(l => {
        sheetMaintenance.addRow({
          ...l,
          formatted_date: formatDate(l.created_at)
        });
      });
      styleHeader(sheetMaintenance);
      
      // Issues Sheet
      const sheetIssues = workbook.addWorksheet('Issues');
      sheetIssues.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Reported Date', key: 'formatted_date' },
        { header: 'Title', key: 'title' },
        { header: 'Severity', key: 'severity' },
        { header: 'Status', key: 'status' },
        { header: 'Reported By', key: 'reported_by_name' },
        { header: 'Resolved By', key: 'resolved_by_name' },
        { header: 'Resolved Date', key: 'formatted_resolved_date' },
        { header: 'Description', key: 'description' }
      ];
      issues.forEach(i => {
        sheetIssues.addRow({
          ...i,
          formatted_date: formatDate(i.created_at),
          formatted_resolved_date: formatDate(i.resolved_at)
        });
      });
      styleHeader(sheetIssues);
      
      // Schedules Sheet
      const schedules = await queryAll(`
        SELECT s.*, t.trolley_code, u.name as assigned_to_name
        FROM maintenance_schedules s
        LEFT JOIN trolleys t ON s.trolley_id = t.id
        LEFT JOIN users u ON s.assigned_to = u.id
        WHERE s.is_active = 1
        ORDER BY s.next_due_date ASC
      `, []);
      const sheetSchedules = workbook.addWorksheet('Schedules');
      sheetSchedules.columns = [
        { header: 'Trolley Code', key: 'trolley_code' },
        { header: 'Upcoming Maintenance Date', key: 'formatted_next_due' },
        { header: 'Maintenance Type', key: 'maintenance_type' },
        { header: 'Frequency (Days)', key: 'frequency_days' },
        { header: 'Scheduled Date', key: 'formatted_created' },
        { header: 'Assigned To', key: 'assigned_to_name' },
        { header: 'Active Status', key: 'status_label' }
      ];
      schedules.forEach(s => {
        sheetSchedules.addRow({
          ...s,
          formatted_next_due: formatDate(s.next_due_date),
          formatted_created: formatDate(s.created_at),
          status_label: s.is_active ? 'ACTIVE' : 'INACTIVE'
        });
      });
      styleHeader(sheetSchedules);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=all_data_export_${Date.now()}.xlsx`);
      
      await workbook.xlsx.write(res);
      return res.end();
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=plant_master_audit_report_${Date.now()}.pdf`);
    generateAllDataPDF({ trolleys, logs, issues }, res, req.user);
  } catch (error) {
    console.error('Export all data error:', error);
    res.status(500).json({ error: 'Failed to export all data' });
  }
};

router.get('/all', verifyToken, handleAllExport);
router.get('/all/pdf', verifyToken, (req, res) => { req.query.format = 'pdf'; handleAllExport(req, res); });
router.get('/all/excel', verifyToken, (req, res) => { req.query.format = 'excel'; handleAllExport(req, res); });

module.exports = router;
