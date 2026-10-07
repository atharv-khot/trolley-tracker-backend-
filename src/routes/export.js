const express = require('express');
const router = express.Router();
const { queryAll } = require('../db/database');
const { verifyToken } = require('../middleware/auth');
const ExcelJS = require('exceljs');

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

router.get('/trolleys', verifyToken, async (req, res) => {
  try {
    const trolleys = queryAll(`SELECT * FROM trolleys`, []);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Trolleys');
    
    worksheet.columns = [
      { header: 'Code', key: 'trolley_code' },
      { header: 'Location', key: 'location' },
      { header: 'Status', key: 'status' },
      { header: 'Condition', key: 'condition' },
      { header: 'Manufactured Date', key: 'manufactured_date' },
      { header: 'Notes', key: 'notes' },
      { header: 'Created At', key: 'created_at' }
    ];
    
    trolleys.forEach(t => worksheet.addRow(t));
    styleHeader(worksheet);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=trolleys_export_${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export trolleys error:', error);
    res.status(500).json({ error: 'Failed to export trolleys' });
  }
});

router.get('/maintenance', verifyToken, async (req, res) => {
  try {
    const logs = queryAll(`
      SELECT m.*, t.trolley_code, u.name as performed_by_name 
      FROM maintenance_logs m 
      LEFT JOIN trolleys t ON m.trolley_id = t.id 
      LEFT JOIN users u ON m.performed_by = u.id
    `, []);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Maintenance');
    
    worksheet.columns = [
      { header: 'Trolley Code', key: 'trolley_code' },
      { header: 'Type', key: 'type' },
      { header: 'Description', key: 'description' },
      { header: 'Parts Replaced', key: 'parts_replaced' },
      { header: 'Status', key: 'status' },
      { header: 'Performed By', key: 'performed_by_name' },
      { header: 'Date', key: 'created_at' }
    ];
    
    logs.forEach(l => worksheet.addRow(l));
    styleHeader(worksheet);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=maintenance_export_${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export maintenance error:', error);
    res.status(500).json({ error: 'Failed to export maintenance logs' });
  }
});

router.get('/issues', verifyToken, async (req, res) => {
  try {
    const issues = queryAll(`
      SELECT i.*, t.trolley_code, u1.name as reported_by_name, u2.name as resolved_by_name
      FROM issues i
      LEFT JOIN trolleys t ON i.trolley_id = t.id
      LEFT JOIN users u1 ON i.reported_by = u1.id
      LEFT JOIN users u2 ON i.resolved_by = u2.id
    `, []);
    
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Issues');
    
    worksheet.columns = [
      { header: 'Trolley Code', key: 'trolley_code' },
      { header: 'Title', key: 'title' },
      { header: 'Description', key: 'description' },
      { header: 'Severity', key: 'severity' },
      { header: 'Status', key: 'status' },
      { header: 'Reported By', key: 'reported_by_name' },
      { header: 'Resolved By', key: 'resolved_by_name' },
      { header: 'Date', key: 'created_at' }
    ];
    
    issues.forEach(i => worksheet.addRow(i));
    styleHeader(worksheet);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=issues_export_${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export issues error:', error);
    res.status(500).json({ error: 'Failed to export issues' });
  }
});

router.get('/all', verifyToken, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    
    // Trolleys
    const trolleys = queryAll(`SELECT * FROM trolleys`, []);
    const sheetTrolleys = workbook.addWorksheet('Trolleys');
    sheetTrolleys.columns = [
      { header: 'Code', key: 'trolley_code' },
      { header: 'Location', key: 'location' },
      { header: 'Status', key: 'status' },
      { header: 'Condition', key: 'condition' },
      { header: 'Manufactured Date', key: 'manufactured_date' },
      { header: 'Notes', key: 'notes' },
      { header: 'Created At', key: 'created_at' }
    ];
    trolleys.forEach(t => sheetTrolleys.addRow(t));
    styleHeader(sheetTrolleys);
    
    // Maintenance
    const logs = queryAll(`
      SELECT m.*, t.trolley_code, u.name as performed_by_name 
      FROM maintenance_logs m 
      LEFT JOIN trolleys t ON m.trolley_id = t.id 
      LEFT JOIN users u ON m.performed_by = u.id
    `, []);
    const sheetMaintenance = workbook.addWorksheet('Maintenance');
    sheetMaintenance.columns = [
      { header: 'Trolley Code', key: 'trolley_code' },
      { header: 'Type', key: 'type' },
      { header: 'Description', key: 'description' },
      { header: 'Parts Replaced', key: 'parts_replaced' },
      { header: 'Status', key: 'status' },
      { header: 'Performed By', key: 'performed_by_name' },
      { header: 'Date', key: 'created_at' }
    ];
    logs.forEach(l => sheetMaintenance.addRow(l));
    styleHeader(sheetMaintenance);
    
    // Issues
    const issues = queryAll(`
      SELECT i.*, t.trolley_code, u1.name as reported_by_name, u2.name as resolved_by_name
      FROM issues i
      LEFT JOIN trolleys t ON i.trolley_id = t.id
      LEFT JOIN users u1 ON i.reported_by = u1.id
      LEFT JOIN users u2 ON i.resolved_by = u2.id
    `, []);
    const sheetIssues = workbook.addWorksheet('Issues');
    sheetIssues.columns = [
      { header: 'Trolley Code', key: 'trolley_code' },
      { header: 'Title', key: 'title' },
      { header: 'Description', key: 'description' },
      { header: 'Severity', key: 'severity' },
      { header: 'Status', key: 'status' },
      { header: 'Reported By', key: 'reported_by_name' },
      { header: 'Resolved By', key: 'resolved_by_name' },
      { header: 'Date', key: 'created_at' }
    ];
    issues.forEach(i => sheetIssues.addRow(i));
    styleHeader(sheetIssues);
    
    // Schedules
    const schedules = queryAll(`
      SELECT s.*, t.trolley_code, u.name as assigned_to_name
      FROM maintenance_schedules s
      LEFT JOIN trolleys t ON s.trolley_id = t.id
      LEFT JOIN users u ON s.assigned_to = u.id
    `, []);
    const sheetSchedules = workbook.addWorksheet('Schedules');
    sheetSchedules.columns = [
      { header: 'Trolley Code', key: 'trolley_code' },
      { header: 'Maintenance Type', key: 'maintenance_type' },
      { header: 'Frequency (Days)', key: 'frequency_days' },
      { header: 'Next Due Date', key: 'next_due_date' },
      { header: 'Assigned To', key: 'assigned_to_name' },
      { header: 'Active', key: 'is_active' }
    ];
    schedules.forEach(s => sheetSchedules.addRow(s));
    styleHeader(sheetSchedules);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=all_data_export_${Date.now()}.xlsx`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export all data error:', error);
    res.status(500).json({ error: 'Failed to export all data' });
  }
});

module.exports = router;
