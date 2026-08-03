const TransactionLog = require('../models/TransactionLog');

// Fetch the logged-in user's passbook history
const getMyTransactions = async (req, res) => {
  try {
    // Get the ID of the currently logged-in user from the auth token
    const userId = req.user.id || req.user._id;
    
    // Query the database using 'memberId' to perfectly match your schema
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