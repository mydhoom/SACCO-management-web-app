// routes/correctionRoutes.js
// Correction Manager — All routes are admin-only

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const {
  searchForCorrection,
  reverseTransaction,
  editTransaction,
  getEventLog
} = require('../controllers/correctionController');

// Admin role guard middleware
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
};

// GET  /api/corrections/search       — Find transactions for correction
// GET  /api/corrections/event-log    — Read the immutable audit log
// POST /api/corrections/:txId/reverse — Reverse a transaction (atomic + EventLog)
// PATCH /api/corrections/:txId/edit  — Edit safe fields (atomic + EventLog)

router.get('/search',                   authenticate, adminOnly, searchForCorrection);
router.get('/event-log',                authenticate, adminOnly, getEventLog);
router.post('/:txId/reverse',           authenticate, adminOnly, reverseTransaction);
router.patch('/:txId/edit',             authenticate, adminOnly, editTransaction);

module.exports = router;
