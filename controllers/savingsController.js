const Member = require("../models/Member");
const User = require("../models/User")
const Savings = require("../models/Savings");
const TransactionLog = require("../models/TransactionLog");

// ==========================================
// 1. EXISTING CONTROLLERS 
// ==========================================

exports.addSavings = async (req, res) => {
  try {
    const { memberId, amount } = req.body;

    const savings = new Savings({ memberId, amount });
    await savings.save();

    await TransactionLog.create({
      memberId: memberId,
      vendorNo: req.body.vendorNo || "SYSTEM_ENTRY", 
      ledgerFolio: '154', // <-- FIX: Strictly mapped to Folio 154 (Recurring Deposit Account Members)
      category: "MONTHLY_THRIFT", 
      amount: amount,
      entryType: "CREDIT",
      transactionId: `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`, 
      description: "Direct Savings Addition",
      status: "COMPLETED"
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
          createdAt: { $gte: startOfMonth }
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
    
    const memberTotals = await Savings.aggregate([
      { $match: { memberId: memberId } }, 
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
    const transactions = await TransactionLog.find()
      .populate('memberId', 'firstName lastName email vendorNo') 
      .sort({ createdAt: -1 })
      .limit(50);

    const formattedTransactions = transactions.map(trx => ({
      id: trx._id,
      date: new Date(trx.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      vendorNo: trx.memberId?.vendorNo || 'N/A', 
      name: trx.memberId ? `${trx.memberId.firstName} ${trx.memberId.lastName}` : 'Unknown',
      amount: trx.amount,
      type: trx.category || 'Savings', 
      status: 'Credited' 
    }));

    res.status(200).json({ success: true, data: formattedTransactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Process a new Share, Mandatory, or Voluntary deposit using Vendor No
 */
exports.processDeposit = async (req, res) => {
  try {
    const { vendorNo, amount, type, action } = req.body;

    if (!vendorNo || !amount || !type) {
      return res.status(400).json({ success: false, message: "Please provide Vendor Number, amount, and type" });
    }

    let member = await Member.findOne({ vendorNo: req.body.vendorNo });
    if (!member) {
      member = await User.findOne({ vendorNo: req.body.vendorNo });
    }

    if (!member) {
      return res.status(404).json({ 
        success: false, 
        message: `Transaction failed: No member found with Vendor Number '${req.body.vendorNo}'` 
      });
    }

    const memberId = member._id;
    
    // --- 1. THE TRANSLATOR DICTIONARIES ---
    const categoryMapping = {
      'Monthly Thrift/RD': 'MONTHLY_THRIFT',
      'Voluntary Savings': 'MONTHLY_THRIFT', 
      'Mandatory Savings': 'MONTHLY_THRIFT', 
      'RD Late Fine / Penalty': 'PENALTY',
      'Loan EMI Payment': 'LOAN_EMI',
      'Loan Prepayment': 'LOAN_REPAYMENT',
      'Loan Late Fee / Penalty': 'PENALTY',
      'Share Capital': 'SHARE_CAPITAL',
      'Admission Fee': 'ADMISSION_FEE',
      'Stationary / Misc': 'STATIONARY_MISC',
      'General Penalty / Fine': 'PENALTY'
    };
    
    // FIX: Hardcoded Folio routing based on the official PDF document
    const folioMapping = {
      'Monthly Thrift/RD': '154',      // Recurring Deposit Account Members
      'Voluntary Savings': '154',      // Recurring Deposit Account Members
      'Mandatory Savings': '154',      // Recurring Deposit Account Members
      'RD Late Fine / Penalty': '157', // Mapped to Misc
      'Loan EMI Payment': '152',       // Members Loan Account
      'Loan Prepayment': '152',        // Members Loan Account
      'Loan Late Fee / Penalty': '152',// Excess recovery of loan
      'Share Capital': '155',          // Member Share Account
      'Admission Fee': '157',          // Admission fees
      'Stationary / Misc': '157',      // Stationary/Miscellaneous Account
      'General Penalty / Fine': '157'  // Mapped to Misc
    };

    const dbCategory = categoryMapping[req.body.type] || 'MONTHLY_THRIFT';
    const dbFolio = folioMapping[req.body.type] || '157'; 

    const paymentModeMapping = {
      'Cash': 'CASH',
      'UPI': 'UPI',
      'Cheque': 'CHEQUE',
      'NEFT/RTGS': 'BANK_TRANSFER',
      'Bank Transfer': 'BANK_TRANSFER',
      'Payroll Deduction': 'INTERNAL_TRANSFER'
    };
    const dbPaymentMode = paymentModeMapping[req.body.mode] || 'CASH';
    const dbEntryType = req.body.action === 'Deposit' ? 'CREDIT' : 'DEBIT';

    // --- 2. CREATE THE SAVINGS DOCUMENT ---
    const savings = new Savings({ memberId, amount });
    await savings.save();

    // --- 3. CREATE THE ROBUST TRANSACTION LOG RECORD ---
    const newTransaction = await TransactionLog.create({
      vendorNo: req.body.vendorNo,
      ledgerFolio: dbFolio, // <-- FIX: Securely locked by the backend
      memberId: memberId,
      category: dbCategory,
      amount: Math.abs(amount),
      entryType: dbEntryType,
      paymentMode: dbPaymentMode,
      transactionId: `TRX-${Date.now()}`,
      description: req.body.remarks || `${req.body.action || 'Deposit'} - ${req.body.type}`,
      status: 'COMPLETED',
      transactionReference: req.body.referenceNo || null
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
 * Verify Member (or User) by Vendor No before transaction
 */
exports.verifyMember = async (req, res) => {
  try {
    const { vendorNo } = req.params;
    
    let person = await Member.findOne({ vendorNo: vendorNo });
    
    if (!person) {
      person = await User.findOne({ vendorNo: vendorNo });
    }
    
    if (!person) {
      return res.status(404).json({ 
        success: false, 
        message: `No account found with Vendor No: ${vendorNo}` 
      });
    }

    const transactions = await TransactionLog.find({ vendorNo: vendorNo, status: 'COMPLETED' });
    
    let calculatedBalance = 0;
    let activeLoanBalance = 0; 
    
    transactions.forEach(trx => {
      if (trx.ledgerFolio === '152') {
        if (trx.entryType === 'DEBIT') {
          activeLoanBalance += Number(trx.amount || 0); 
        } else if (trx.entryType === 'CREDIT') {
          activeLoanBalance -= Number(trx.amount || 0); 
        }
      } 
      else {
        if (trx.entryType === 'CREDIT' || trx.action === 'Deposit') {
          calculatedBalance += Number(trx.amount || 0);
        } else if (trx.entryType === 'DEBIT' || trx.action === 'Withdrawal') {
          calculatedBalance -= Math.abs(Number(trx.amount || 0));
        }
      }
    });

    const finalBalance = calculatedBalance !== 0 ? calculatedBalance : (person.currentShareMoneyTotal || 0);
    const finalLoanBalance = activeLoanBalance !== 0 ? activeLoanBalance : (person.pendingLoanBalance || 0);

    const fullName = person.name || `${person.firstName || ''} ${person.lastName || ''}`.trim();

    res.status(200).json({ 
      success: true, 
      data: { 
        name: fullName,
        availableBalance: finalBalance,
        activeLoanBalance: finalLoanBalance > 0 ? finalLoanBalance : 0 
      } 
    });
    
  } catch (error) {
    console.error("Error verifying member:", error);
    res.status(500).json({ success: false, message: "Server error verifying member" });
  }
};