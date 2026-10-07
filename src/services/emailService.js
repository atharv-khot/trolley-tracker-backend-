const nodemailer = require('nodemailer');

// Setup transporter using environment variables
const createTransporter = () => {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!user || !pass) {
    return null; // SMTP not configured yet
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false
    }
  });
};

const sendMaintenanceAlertEmail = async ({
  to,
  trolleyCode,
  type,
  performerName,
  performerEmail,
  description,
  partsReplaced,
  checklist = [],
  createdAt
}) => {
  const recipient = to || process.env.ALERT_EMAIL || 'atharvkhot@trolley.com';
  const fromAddress = process.env.EMAIL_FROM || process.env.SMTP_USER || 'no-reply@trolleytracker.com';
  
  // Parse checklist if needed
  let items = checklist;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch (e) {
      items = [];
    }
  }

  const okCount = items.filter(i => i.status === 'OK').length;
  const defectCount = items.filter(i => i.status === 'DEFECT').length;
  const fairCount = items.filter(i => i.status === 'FAIR').length;

  const hasDefects = defectCount > 0;
  const statusBadge = hasDefects
    ? '<span style="background-color:#fee2e2;color:#b91c1c;padding:4px 10px;border-radius:12px;font-weight:bold;font-size:12px;">⚠️ DEFECTS DETECTED</span>'
    : '<span style="background-color:#dcfce7;color:#15803d;padding:4px 10px;border-radius:12px;font-weight:bold;font-size:12px;">✅ ALL INSPECTIONS PASSED</span>';

  const subject = `${hasDefects ? '⚠️ DEFECT ALERT' : '✅ MAINTENANCE LOG'}: Trolley ${trolleyCode} [${type}]`;

  // Build checklist rows
  const checklistRows = items.map((item, idx) => {
    let color = '#6b7280';
    let label = 'Not Checked';
    let bg = '#f3f4f6';

    if (item.status === 'OK') {
      color = '#15803d';
      label = '✓ OK';
      bg = '#dcfce7';
    } else if (item.status === 'FAIR') {
      color = '#b45309';
      label = '⚠️ Attention';
      bg = '#fef3c7';
    } else if (item.status === 'DEFECT') {
      color = '#b91c1c';
      label = '✕ Defect';
      bg = '#fee2e2';
    }

    return `
      <tr style="border-bottom: 1px solid #e5e7eb; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding: 10px 14px; font-weight: 500; color: #1f2937;">${item.name}</td>
        <td style="padding: 10px 14px; text-align: center;">
          <span style="background-color: ${bg}; color: ${color}; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700;">
            ${label}
          </span>
        </td>
        <td style="padding: 10px 14px; color: #4b5563; font-size: 13px;">${item.remarks || '<span style="color:#9ca3af;">—</span>'}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${subject}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px; color: #111827;">
      <div style="max-width: 650px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); border: 1px solid #e5e7eb;">
        
        <!-- Header -->
        <div style="background-color: #1e3a8a; padding: 24px 28px; color: #ffffff;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;">🛒 Trolley Maintenance Tracker</h1>
          </div>
          <p style="margin: 6px 0 0; color: #bfdbfe; font-size: 13px;">Automated Maintenance & Check Sheet Mail Notification</p>
        </div>

        <div style="padding: 24px 28px;">
          
          <!-- Summary Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
            <div>
              <span style="font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Trolley Unit</span>
              <div style="font-size: 22px; font-weight: 800; color: #1e3a8a;">${trolleyCode}</div>
            </div>
            <div style="text-align: right;">
              ${statusBadge}
              <div style="margin-top: 6px; font-size: 12px; color: #6b7280;">${new Date(createdAt || Date.now()).toLocaleString()}</div>
            </div>
          </div>

          <!-- Quick Stats Cards -->
          <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 20px;">
            <tr>
              <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
                <div style="font-size: 11px; color: #64748b; font-weight: 600;">TYPE</div>
                <div style="font-size: 15px; font-weight: 700; color: #0f172a; margin-top: 2px;">${type}</div>
              </td>
              <td style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
                <div style="font-size: 11px; color: #047857; font-weight: 600;">PASSED (OK)</div>
                <div style="font-size: 18px; font-weight: 800; color: #047857; margin-top: 2px;">${okCount}</div>
              </td>
              <td style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
                <div style="font-size: 11px; color: #b45309; font-weight: 600;">ATTENTION</div>
                <div style="font-size: 18px; font-weight: 800; color: #b45309; margin-top: 2px;">${fairCount}</div>
              </td>
              <td style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; text-align: center; width: 25%;">
                <div style="font-size: 11px; color: #b91c1c; font-weight: 600;">DEFECTS</div>
                <div style="font-size: 18px; font-weight: 800; color: #b91c1c; margin-top: 2px;">${defectCount}</div>
              </td>
            </tr>
          </table>

          <!-- 8-Point Check Sheet Table -->
          <h3 style="font-size: 15px; font-weight: 700; margin: 18px 0 10px; color: #1f2937;">📋 8-Point Check Sheet Results</h3>
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
            <thead>
              <tr style="background-color: #f3f4f6; text-align: left; font-size: 12px; color: #4b5563;">
                <th style="padding: 10px 14px; font-weight: 600;">Check Item</th>
                <th style="padding: 10px 14px; font-weight: 600; text-align: center;">Status</th>
                <th style="padding: 10px 14px; font-weight: 600;">Technician Remarks</th>
              </tr>
            </thead>
            <tbody>
              ${checklistRows || '<tr><td colspan="3" style="padding:12px;text-align:center;color:#9ca3af;">No check items recorded</td></tr>'}
            </tbody>
          </table>

          <!-- Details & Remarks -->
          <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 14px 18px; border-radius: 4px; margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #1e3a8a; margin-bottom: 4px;">SUMMARY & NOTES</div>
            <div style="font-size: 14px; color: #334155;">${description || 'Routine maintenance recorded.'}</div>
          </div>

          ${partsReplaced ? `
          <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 4px; margin-bottom: 16px;">
            <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 4px;">PARTS REPLACED</div>
            <div style="font-size: 14px; color: #334155;">${partsReplaced}</div>
          </div>
          ` : ''}

          <!-- Performer Info -->
          <div style="border-top: 1px solid #e5e7eb; padding-top: 14px; margin-top: 16px; font-size: 13px; color: #6b7280;">
            <strong>Performed By:</strong> ${performerName || 'Technician'} (${performerEmail || 'Admin'})
          </div>

        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 16px 28px; text-align: center; font-size: 12px; color: #9ca3af;">
          Sent by Trolley Maintenance Tracker System • Real-Time Plant Asset Monitoring
        </div>
      </div>
    </body>
    </html>
  `;

  const transporter = createTransporter();

  if (transporter) {
    try {
      const info = await transporter.sendMail({
        from: `Trolley Tracker <${fromAddress}>`,
        to: recipient,
        subject,
        html
      });
      console.log(`[EMAIL] Maintenance alert sent successfully to ${recipient}. MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId, recipient };
    } catch (err) {
      console.error(`[EMAIL ERROR] Failed to send email via SMTP:`, err.message);
      return { success: false, error: err.message, recipient };
    }
  } else {
    // Simulated delivery (logs to console and system when SMTP is not configured)
    console.log(`--------------------------------------------------`);
    console.log(`[EMAIL TRIGGER - SIMULATION MODE]`);
    console.log(`To: ${recipient}`);
    console.log(`Subject: ${subject}`);
    console.log(`Trolley: ${trolleyCode} | Performed by: ${performerName}`);
    console.log(`Check Sheet Status: ${okCount} OK, ${fairCount} Attention, ${defectCount} Defect(s)`);
    console.log(`(Configure SMTP_USER & SMTP_PASS in .env for live email delivery)`);
    console.log(`--------------------------------------------------`);
    return {
      success: true,
      simulated: true,
      recipient,
      message: 'Email notification triggered successfully (Simulation mode active - set SMTP credentials in .env for live delivery).'
    };
  }
};

module.exports = {
  sendMaintenanceAlertEmail
};
