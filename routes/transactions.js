const express = require('express');
const router = express.Router();
const TransactionLog = require('../models/TransactionLog'); // Linking to the model we built yesterday!
// Import your new controller and the auth middleware
const { getMyTransactions } = require('../controllers/transactionController');
const { authenticate } = require('../middlewares/authMiddleware');

// --- YOUR NEW ROUTE ---
router.get('/my-transactions', authenticate, getMyTransactions);
// GET: Fetch all transactions for the Master Journal (Sorted newest first)
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