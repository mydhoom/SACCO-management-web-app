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
const calculateTransactionBalances = (transactions) => {
  let calculatedBalance = 0;
  let activeLoanBalance = 0;
  let pendingWithdrawals = 0;

  transactions.forEach((trx) => {
    // Skip reversed transactions and reversal counter-entries entirely
    if (trx.status === 'REVERSED' || trx.category === 'REVERSAL') return;

    const amount = Number(trx.amount || 0);
    if (trx.ledgerFolio === '152') {
      if (trx.entryType === 'DEBIT') {
        activeLoanBalance += amount;
      } else if (trx.entryType === 'CREDIT') {
        activeLoanBalance -= amount;
      }
      return;
    }

    if (trx.status === 'PENDING_VERIFICATION' && trx.entryType === 'DEBIT') {
      pendingWithdrawals += amount;
    }

    if (trx.entryType === 'CREDIT') {
      calculatedBalance += amount;
    } else if (trx.entryType === 'DEBIT') {
      calculatedBalance -= amount;
    }
  });

  return {
    availableBalance: calculatedBalance - pendingWithdrawals,
    activeLoanBalance,
  };
};

exports.processDeposit = async (req, res) => {
  try {
    const { vendorNo, amount, type, action, mode, memberUpiId } = req.body;
    const parsedAmount = Number(amount);

    if (!vendorNo || !type || !action || Number.isNaN(parsedAmount) || parsedAmount === 0) {
      return res.status(400).json({ success: false, message: 'Please provide Vendor Number, amount, type, and action.' });
    }

    const isWithdrawal = action === 'Withdrawal';
    const requestedAmount = Math.abs(parsedAmount);

    let member = await Member.findOne({ vendorNo });
    if (!member) {
      member = await User.findOne({ vendorNo });
    }

    if (!member) {
      return res.status(404).json({
        success: false,
        message: `Transaction failed: No member found with Vendor Number '${vendorNo}'`
      });
    }

    const memberId = member._id;

    const allTransactions = await TransactionLog.find({ vendorNo });
    const { availableBalance, activeLoanBalance } = calculateTransactionBalances(allTransactions);

    if (isWithdrawal) {
      if (requestedAmount > availableBalance) {
        return res.status(400).json({
          success: false,
          message: `Withdrawal denied: insufficient available balance (₹${availableBalance.toLocaleString('en-IN')}).`
        });
      }

      if (type === 'Share Capital' && activeLoanBalance > 0) {
        return res.status(400).json({
          success: false,
          message: `Withdrawal denied: share capital can only be withdrawn after loan clearance.`
        });
      }

      if (type === 'Recurring Deposit' && requestedAmount > activeLoanBalance && activeLoanBalance > 0) {
        return res.status(400).json({
          success: false,
          message: `Withdrawal denied: RD withdrawal cannot exceed outstanding loan balance of ₹${activeLoanBalance.toLocaleString('en-IN')}.`
        });
      }
    }

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
      'General Penalty / Fine': 'PENALTY',
      'Recurring Deposit': 'RECURRING_DEPOSIT'
    };

    const folioMapping = {
      'Monthly Thrift/RD': '154',
      'Voluntary Savings': '154',
      'Mandatory Savings': '154',
      'RD Late Fine / Penalty': '157',
      'Loan EMI Payment': '152',
      'Loan Prepayment': '152',
      'Loan Late Fee / Penalty': '152',
      'Share Capital': '155',
      'Admission Fee': '157',
      'Stationary / Misc': '157',
      'General Penalty / Fine': '157',
      'Recurring Deposit': '154'
    };

    const paymentModeMapping = {
      Cash: 'CASH',
      UPI: 'UPI',
      Cheque: 'CHEQUE',
      'NEFT/RTGS': 'BANK_TRANSFER',
      'Bank Transfer': 'BANK_TRANSFER',
      'Payroll Deduction': 'INTERNAL_TRANSFER'
    };

    const dbCategory = categoryMapping[type] || 'MONTHLY_THRIFT';
    const dbFolio = folioMapping[type] || '157';
    const dbPaymentMode = paymentModeMapping[mode] || 'CASH';
    const dbEntryType = isWithdrawal ? 'DEBIT' : 'CREDIT';
    const transactionStatus = isWithdrawal ? 'PENDING_VERIFICATION' : 'COMPLETED';

    const fullName = member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim();

    const newTransaction = await TransactionLog.create({
      vendorNo,
      memberName: fullName,
      ledgerFolio: dbFolio,
      memberId,
      category: dbCategory,
      amount: requestedAmount,
      entryType: dbEntryType,
      paymentMode: dbPaymentMode,
      transactionId: `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      description: req.body.remarks || `${action} - ${type}`,
      status: transactionStatus,
      transactionReference: req.body.referenceNo || null,
      memberUpiId: memberUpiId?.trim() || null
    });

    if (!isWithdrawal) {
      const savings = new Savings({ memberId, amount: parsedAmount });
      await savings.save();
    }

    const successMessage = isWithdrawal
      ? 'Withdrawal request submitted successfully. An admin will clear it once funds are arranged.'
      : `${action || type} processed successfully for ${fullName} (Vendor: ${vendorNo}).`;

    res.status(201).json({ success: true, message: successMessage, transaction: newTransaction });
  } catch (error) {
    console.error('Error processing transaction:', error);
    res.status(500).json({ success: false, message: 'Server error processing transaction' });
  }
};

exports.getPendingWithdrawals = async (req, res) => {
  try {
    const pending = await TransactionLog.find({ status: 'PENDING_VERIFICATION', entryType: 'DEBIT' })
      .populate('memberId', 'vendorNo firstName lastName name');

    const formatted = pending.map((trx) => ({
      transactionId: trx.transactionId,
      vendorNo: trx.vendorNo,
      memberName: trx.memberName || `${trx.memberId?.firstName || ''} ${trx.memberId?.lastName || ''}`.trim(),
      amount: trx.amount,
      paymentMode: trx.paymentMode,
      referenceNumber: trx.transactionReference,
      transactionDate: trx.transactionDate,
      documentProofUrl: trx.documentProofUrl,
      memberUpiId: trx.memberUpiId,
      status: trx.status
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (error) {
    console.error('Error fetching pending withdrawals:', error);
    res.status(500).json({ success: false, message: 'Server error fetching pending withdrawals' });
  }
};

exports.approveWithdrawal = async (req, res) => {
  try {
    const { transactionId } = req.params;

    const pendingTx = await TransactionLog.findOne({ transactionId, status: 'PENDING_VERIFICATION', entryType: 'DEBIT' });
    if (!pendingTx) {
      return res.status(404).json({ success: false, message: 'Pending withdrawal not found.' });
    }

    await Savings.create({ memberId: pendingTx.memberId, amount: -Math.abs(pendingTx.amount) });
    pendingTx.status = 'COMPLETED';
    await pendingTx.save();

    res.status(200).json({ success: true, message: 'Withdrawal approved and posted to the ledger.' });
  } catch (error) {
    console.error('Error approving withdrawal:', error);
    res.status(500).json({ success: false, message: 'Server error approving withdrawal' });
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

    const transactions = await TransactionLog.find({ vendorNo: vendorNo });
    
    let calculatedBalance = 0;
    let activeLoanBalance = 0;
    let pendingWithdrawals = 0;
    
    transactions.forEach(trx => {
      // Skip reversed transactions and reversal counter-entries entirely
      if (trx.status === 'REVERSED' || trx.category === 'REVERSAL') return;

      if (trx.ledgerFolio === '152') {
        if (trx.entryType === 'DEBIT') {
          activeLoanBalance += Number(trx.amount || 0);
        } else if (trx.entryType === 'CREDIT') {
          activeLoanBalance -= Number(trx.amount || 0);
        }
        return;
      }

      if (trx.status === 'PENDING_VERIFICATION' && trx.entryType === 'DEBIT') {
        pendingWithdrawals += Number(trx.amount || 0);
      }

      if (trx.entryType === 'CREDIT' || trx.action === 'Deposit') {
        calculatedBalance += Number(trx.amount || 0);
      } else if (trx.entryType === 'DEBIT' || trx.action === 'Withdrawal') {
        calculatedBalance -= Math.abs(Number(trx.amount || 0));
      }
    });

    const finalBalance = calculatedBalance - pendingWithdrawals;
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