const express = require('express');
const router = express.Router();
const TransactionLog = require('../models/TransactionLog');
const { getMyTransactions, bulkSharesUpload, bulkEmiUpload } = require('../controllers/transactionController');
const { authenticate } = require('../middlewares/authMiddleware');

// Middleware: restrict to admin or executive only
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'executive') {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
};

// GET: Passbook for logged-in member (or any member for admin/executive)
router.get('/my-transactions', authenticate, getMyTransactions);

// POST: Bulk payroll deduction — Share Capital + RD (from UpdateData screen)
router.post('/bulk-shares', authenticate, adminOnly, bulkSharesUpload);

// POST: Bulk EMI deduction batch (from UpdateData screen)
router.post('/bulk-emis', authenticate, adminOnly, bulkEmiUpload);

// GET: Master Journal — all transactions (admin view, newest first)
router.get('/', async (req, res) => {
  try {
    const transactions = await TransactionLog.find()
      .sort({ createdAt: -1 })
      .populate('memberId', 'firstName lastName vendorNo');
    res.status(200).json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ success: false, message: "Server error fetching Master Journal logs" });
  }
});

module.exports = router;
