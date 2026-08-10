const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { getDashboardKPIs, getDefaulters, getMemberDashboard, sendDefaulterReminder } = require('../controllers/dashboardController');

// Admin-only: Full society-wide KPIs and charts
router.get('/kpis', authenticate, authorize(['admin']), getDashboardKPIs);

// Admin-only: Defaulter detection & Reminders
router.get('/defaulters', authenticate, authorize(['admin']), getDefaulters);
router.post('/defaulters/remind', authenticate, authorize(['admin']), sendDefaulterReminder);

// Member (authenticated): Their own personal financial dashboard
router.get('/member', authenticate, getMemberDashboard);

module.exports = router;
