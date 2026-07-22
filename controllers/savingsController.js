const Savings = require("../models/Savings");
const TransactionLog = require("../models/TransactionLog");

// ==========================================
// 1. EXISTING CONTROLLERS (Kept Intact)
// ==========================================

exports.addSavings = async (req, res) => {
  try {
    const { memberId, amount } = req.body;

    const savings = new Savings({ memberId, amount });
    await savings.save();

    await TransactionLog.create({
      memberId,
      transactionType: "savings",
      amount,
      details: { savingsId: savings._id },
    });

    res.status(201).json({ message: "Savings added successfully!", savings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getSavings = async (req, res) => {
  try {
    const savings = await Savings.find().populate("memberId", "firstName lastName email");
    res.status(200).json(savings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================
// 2. NEW CONTROLLERS (For Share & Savings Ledger UI)
// ==========================================

/**
 * Get division-wide totals for Share Capital, Mandatory, and Voluntary savings
 */
exports.getDivisionSummary = async (req, res) => {
  try {
    // Note: Since your current Savings schema only has a generic 'amount', 
    // we are summing it all up here. To split this into Shares, Mandatory, 
    // and Voluntary in the future, you will need to add a 'type' field to your Savings schema.
    const summary = await Savings.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" }
        }
      }
    ]);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyCollection = await TransactionLog.aggregate([
      { 
        $match: { 
          createdAt: { $gte: startOfMonth },
          // Adjust this if you track failed vs successful transactions
        } 
      },
      {
        $group: {
          _id: null,
          totalCollected: { $sum: "$amount" }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        // Mapping your generic total to the UI blocks. 
        // Update these when you modify your DB schema to track exact types.
        shares: summary[0]?.totalAmount || 0, 
        mandatory: 0, 
        voluntary: 0,
        thisMonthCollection: monthlyCollection[0]?.totalCollected || 0
      }
    });
  } catch (error) {
    console.error("Error in getDivisionSummary:", error);
    res.status(500).json({ success: false, message: "Server Error fetching summary" });
  }
};

/**
 * Get specific savings and share balances for a single member
 */
exports.getMemberSavingsSummary = async (req, res) => {
  try {
    const { memberId } = req.params;
    
    // Summing up all the individual savings documents for this specific member
    const memberTotals = await Savings.aggregate([
      { $match: { memberId: memberId } }, // Match documents for this member
      { $group: { _id: "$memberId", totalBalance: { $sum: "$amount" } } }
    ]);
    
    if (!memberTotals || memberTotals.length === 0) {
      return res.status(404).json({ success: false, message: "Savings account not found for this member" });
    }

    res.status(200).json({ success: true, data: { totalBalance: memberTotals[0].totalBalance } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get recent deposit/withdrawal transactions for the ledger
 */
exports.getRecentTransactions = async (req, res) => {
  try {
    // Fetch recent transactions using your TransactionLog model
    const transactions = await TransactionLog.find()
      .populate('memberId', 'firstName lastName email vendorNo') // Pulled from your getSavings logic
      .sort({ createdAt: -1 })
      .limit(50);

    // Format data to match exactly what ShareSavings.jsx expects
    const formattedTransactions = transactions.map(trx => ({
      id: trx._id,
      date: new Date(trx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      vendorNo: trx.memberId?.vendorNo || 'N/A', // Assuming you have vendorNo in your Member schema
      name: trx.memberId ? `${trx.memberId.firstName} ${trx.memberId.lastName}` : 'Unknown',
      amount: trx.amount,
      type: trx.transactionType || 'Savings', // Using your transactionType field
      status: 'Credited' // Hardcoded since your DB doesn't seem to track pending/failed status yet
    }));

    res.status(200).json({ success: true, data: formattedTransactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Process a new Share, Mandatory, or Voluntary deposit
 * (An advanced version of your existing addSavings function)
 */
exports.processDeposit = async (req, res) => {
  try {
    const { memberId, amount, type } = req.body;

    if (!memberId || !amount || !type) {
      return res.status(400).json({ success: false, message: "Please provide memberId, amount, and type" });
    }

    // 1. Create the generic Savings document (Matching your existing architecture)
    const savings = new Savings({ memberId, amount });
    // Note: If you add 'type' to your Savings schema, pass it here: new Savings({ memberId, amount, type })
    await savings.save();

    // 2. Create the TransactionLog Record
    const newTransaction = await TransactionLog.create({
      memberId,
      transactionType: type, // 'Share Capital', 'Mandatory Savings', or 'Voluntary Savings' coming from UI
      amount,
      details: { savingsId: savings._id }
    });

    res.status(201).json({
      success: true,
      message: `${type} processed successfully`,
      transaction: newTransaction
    });

  } catch (error) {
    console.error("Error processing deposit:", error);
    res.status(500).json({ success: false, message: "Server error processing deposit" });
  }
};