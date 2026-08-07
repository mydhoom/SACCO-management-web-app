const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/authMiddleware');
const {
  searchForCorrection,
  reverseTransaction,
  editTransaction,
  getEventLog,
  bulkReverseTransactions
} = require('../controllers/correctionController');

// Admin role guard middleware
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ success: false, message: 'Access denied. Admins only.' });
};

router.get('/search',              authenticate, adminOnly, searchForCorrection);
router.get('/event-log',           authenticate, adminOnly, getEventLog);
router.post('/bulk-reverse',       authenticate, adminOnly, bulkReverseTransactions);
router.post('/:txId/reverse',      authenticate, adminOnly, reverseTransaction);
router.patch('/:txId/edit',        authenticate, adminOnly, editTransaction);

module.exports = router;

