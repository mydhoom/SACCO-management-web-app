const Member = require("../models/Member");
const User = require("../models/User")
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
/**
 * Process a new Share, Mandatory, or Voluntary deposit using Vendor No
 */
exports.processDeposit = async (req, res) => {
  try {
    // We now expect 'vendorNo' from the frontend instead of 'memberId'
    const { vendorNo, amount, type, action } = req.body;

    if (!vendorNo || !amount || !type) {
      return res.status(400).json({ success: false, message: "Please provide Vendor Number, amount, and type" });
    }

    // 1. Look up the member using their Vendor Number
    // Adjust 'vendorNo' if your database schema uses a different field name like 'vendorNumber' or 'employeeId'
    // Change 'const' to 'let' so we can update it if the first search fails
let member = await Member.findOne({ vendorNo: req.body.vendorNo });

// If not found in Members, check the Users collection (for Admins/Test accounts)
if (!member) {
  member = await User.findOne({ vendorNo: req.body.vendorNo });
}

// If STILL not found, throw the error
if (!member) {
  return res.status(404).json({ 
    success: false, 
    message: `Transaction failed: No member found with Vendor Number '${req.body.vendorNo}'` 
  });
}

// Now the rest of your 44 lines below this will work perfectly without any changes!
const memberId = member._id;

    // 2. Create the generic Savings document
    const savings = new Savings({ memberId, amount });
    await savings.save();

    // 3. Create the TransactionLog Record
    const newTransaction = await TransactionLog.create({
      memberId,
      transactionType: type,
      amount,
      details: { 
        savingsId: savings._id,
        action: action || 'Deposit',
        paymentMode: req.body.mode || 'Cash',
        referenceNo: req.body.referenceNo,
        remarks: req.body.remarks
      }
    });

    res.status(201).json({
      success: true,
      message: `${action || type} processed successfully for ${member.firstName || 'Member'} (Vendor: ${vendorNo})`,
      transaction: newTransaction
    });

  } catch (error) {
    console.error("Error processing transaction:", error);
    res.status(500).json({ success: false, message: "Server error processing transaction" });
  }
};
/**
 * Verify Member by Vendor No before transaction
 */
/**
 * Verify Member (or User) by Vendor No before transaction
 */
exports.verifyMember = async (req, res) => {
  try {
    const { vendorNo } = req.params;
    
    // 1. Search for the vendorNo in the Members collection first
    let person = await Member.findOne({ vendorNo: vendorNo });
    
    // 2. If not found in Members, check the Users collection (for Admins)
    if (!person) {
      person = await User.findOne({ vendorNo: vendorNo });
    }
    
    // 3. If STILL not found, return the 404
    if (!person) {
      return res.status(404).json({ 
        success: false, 
        message: `No account found with Vendor No: ${vendorNo}` 
      });
    }

    // 4. Calculate available balance and active loan dynamically from TransactionLogs
    const transactions = await TransactionLog.find({ vendorNo: vendorNo, status: 'COMPLETED' });
    
    let calculatedBalance = 0;
    let activeLoanBalance = 0; // NEW: Track loan separately
    
    transactions.forEach(trx => {
      // If it is a Loan Transaction (Folio 152)
      if (trx.ledgerFolio === '152') {
        if (trx.entryType === 'DEBIT') {
          activeLoanBalance += Number(trx.amount || 0); // Loan disbursed (increases due amount)
        } else if (trx.entryType === 'CREDIT') {
          activeLoanBalance -= Number(trx.amount || 0); // EMI Paid (decreases due amount)
        }
      } 
      // If it is a standard Savings/Thrift Transaction
      else {
        if (trx.entryType === 'CREDIT' || trx.action === 'Deposit') {
          calculatedBalance += Number(trx.amount || 0);
        } else if (trx.entryType === 'DEBIT' || trx.action === 'Withdrawal') {
          calculatedBalance -= Math.abs(Number(trx.amount || 0));
        }
      }
    });

    // Fallbacks to profile balances if no transaction logs are found yet
    const finalBalance = calculatedBalance !== 0 ? calculatedBalance : (person.currentShareMoneyTotal || 0);
    const finalLoanBalance = activeLoanBalance !== 0 ? activeLoanBalance : (person.pendingLoanBalance || 0);

    // 5. Safely extract the name, handling both database formats
    const fullName = person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim();

    // 6. Return the successful response including both balances
    res.status(200).json({ 
      success: true, 
      data: { 
        name: fullName,
        availableBalance: finalBalance,
        activeLoanBalance: finalLoanBalance > 0 ? finalLoanBalance : 0 // Prevents negative loan display
      } 
    });
    
  } catch (error) {
    console.error("Error verifying member:", error);
    res.status(500).json({ success: false, message: "Server error verifying member" });
  }
};
