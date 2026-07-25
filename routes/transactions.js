const express = require('express');
const router = express.Router();
const TransactionLog = require('../models/TransactionLog'); // Linking to the model we built yesterday!

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