const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User');

// Fetch passbook history for current user or selected member (for Admin)
const getMyTransactions = async (req, res) => {
  try {
    let userId = req.user.id || req.user._id;

    if ((req.user.role === 'admin' || req.user.role === 'executive') && (req.query.vendorNo || req.query.memberId)) {
      if (req.query.memberId) {
        userId = req.query.memberId;
      } else if (req.query.vendorNo) {
        const targetUser = await User.findOne({ vendorNo: req.query.vendorNo });
        if (targetUser) userId = targetUser._id;
      }
    }
    
    const transactions = await TransactionLog.find({ memberId: userId }).sort({ transactionDate: -1 });
    
    res.status(200).json({ transactions });
  } catch (error) {
    console.error("Get My Transactions Error:", error);
    res.status(500).json({ error: "Failed to fetch transactions." });
  }
};

module.exports = {
  getMyTransactions
};