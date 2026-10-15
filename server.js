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
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    
    try {
      const now = new Date().toISOString();
      const overdue = queryOne(`
        SELECT COUNT(*) as count FROM maintenance_schedules
        WHERE is_active = 1 AND next_due_date < ?
      `, [now]);
      
      if (overdue && overdue.count > 0) {
        console.log(`[REMINDER] You have ${overdue.count} overdue maintenance schedule(s)!`);
      } else {
        console.log(`[REMINDER] No overdue maintenance schedules.`);
      }
    } catch (err) {
      console.error('Failed to check overdue reminders on startup:', err);
    }
  });
}

startServer();
