const mongoose = require('mongoose');
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User');
const Loan = require('../models/Loan');


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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transactions/bulk-shares
// Bulk monthly Share Capital + RD deduction upload from payroll Excel.
// ─────────────────────────────────────────────────────────────────────────────
const bulkSharesUpload = async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No rows provided.' });
  }

  let successCount = 0, skipCount = 0;
  const errors = [];

  for (const row of rows) {
    const vendorNo = String(row.Vendor_No || '').trim();
    const shareAmt = Number(row.Share_Deduction) || 0;
    const rdAmt    = Number(row.RD_Deduction)    || 0;
    const txDate   = row.Transaction_Date ? new Date(row.Transaction_Date) : new Date();
    const batchId  = String(row.Batch_ID || '').trim() || null;

    if (!vendorNo) { errors.push('Row skipped: missing Vendor_No'); skipCount++; continue; }
    if (shareAmt === 0 && rdAmt === 0) { skipCount++; continue; }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const member = await User.findOne({ vendorNo }).session(session);
      if (!member) {
        await session.abortTransaction(); session.endSession();
        errors.push(`Vendor No ${vendorNo}: member not found`); skipCount++; continue;
      }
      const memberName = row.Member_Name || member.name || vendorNo;

      if (shareAmt > 0) {
        await TransactionLog.create([{
          vendorNo, memberId: member._id, memberName,
          category: 'SHARE_CAPITAL', amount: shareAmt, entryType: 'CREDIT',
          paymentMode: 'LOAN_DEDUCTION', transactionDate: txDate, batchId,
          description: `Share Capital Deduction – ${batchId || 'Bulk Upload'}`,
          status: 'COMPLETED',
        }], { session });
        member.currentShareMoneyTotal = (member.currentShareMoneyTotal || 0) + shareAmt;
      }

      if (rdAmt > 0) {
        await TransactionLog.create([{
          vendorNo, memberId: member._id, memberName,
          category: 'RECURRING_DEPOSIT', amount: rdAmt, entryType: 'CREDIT',
          paymentMode: 'LOAN_DEDUCTION', transactionDate: txDate, batchId,
          description: `RD Deduction – ${batchId || 'Bulk Upload'}`,
          status: 'COMPLETED',
        }], { session });
        member.rdBalance = (member.rdBalance || 0) + rdAmt;
      }

      await member.save({ session });
      await session.commitTransaction(); session.endSession();
      successCount++;
    } catch (err) {
      await session.abortTransaction(); session.endSession();
      console.error(`bulkSharesUpload error [${vendorNo}]:`, err.message);
      errors.push(`Vendor No ${vendorNo}: ${err.message}`); skipCount++;
    }
  }

  const allFailed = successCount === 0;
  return res.status(allFailed ? 422 : 200).json({
    success: !allFailed,
    message: `Shares/RD batch complete. Processed: ${successCount}, Skipped: ${skipCount}.`,
    results: { successCount, skipCount, errorCount: errors.length, errors },
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/transactions/bulk-emis
// Bulk EMI deduction. Splits into principal + interest, reduces loan balance.
// ─────────────────────────────────────────────────────────────────────────────
const bulkEmiUpload = async (req, res) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success: false, message: 'No rows provided.' });
  }

  let successCount = 0, skipCount = 0;
  const errors = [];

  for (const row of rows) {
    const vendorNo  = String(row.Vendor_No || '').trim();
    const emiAmt    = Number(row.Total_EMI_Amount) || 0;
    const loanIdStr = String(row.Loan_ID || '').trim() || null;
    const txDate    = row.Transaction_Date ? new Date(row.Transaction_Date) : new Date();
    const batchId   = String(row.Batch_ID || '').trim() || null;

    if (!vendorNo || emiAmt <= 0) {
      errors.push('Row skipped: missing Vendor_No or zero EMI');
      skipCount++; continue;
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const member = await User.findOne({ vendorNo }).session(session);
      if (!member) {
        await session.abortTransaction(); session.endSession();
        errors.push(`Vendor No ${vendorNo}: member not found`); skipCount++; continue;
      }

      // Resolve loan: by Loan_ID if given, else latest ACTIVE
      let loan = null;
      if (loanIdStr) loan = await Loan.findOne({ loanId: loanIdStr }).session(session);
      if (!loan) {
        loan = await Loan.findOne({ memberId: member._id, status: 'ACTIVE' })
          .sort({ startDate: -1 }).session(session);
      }

      const memberName = row.Member_Name || member.name || vendorNo;

      await TransactionLog.create([{
        vendorNo, memberId: member._id, memberName,
        category: 'LOAN_EMI', amount: emiAmt, entryType: 'CREDIT',
        paymentMode: 'LOAN_DEDUCTION', transactionDate: txDate, batchId,
        relatedLoanId: loan ? loan._id : null,
        description: `EMI Deduction – ${batchId || 'Bulk Upload'}${loanIdStr ? ` (Loan: ${loanIdStr})` : ''}`,
        status: 'COMPLETED',
      }], { session });

      // Principal/Interest split
      const annualRate     = (loan ? (loan.interestRate || 10) : 10) / 100;
      const monthlyRate    = annualRate / 12;
      const currentBal     = (loan ? (loan.principalPending || 0) : 0) || member.pendingLoanBalance || 0;
      const interestDue    = Math.round(currentBal * monthlyRate);
      const principalPaid  = Math.min(Math.max(0, emiAmt - interestDue), currentBal);
      const newPrincipal   = Math.max(0, currentBal - principalPaid);

      if (loan) {
        loan.principalPending = newPrincipal;
        if (typeof loan.interestPending === 'number') {
          loan.interestPending = Math.max(0, loan.interestPending - interestDue);
        }
        if (newPrincipal <= 0) loan.status = 'REPAID';
        await loan.save({ session });
      }

      member.pendingLoanBalance = newPrincipal;
      if (newPrincipal <= 0) { member.monthlyEmiAmount = 0; member.defaulterStatus = false; }
      await member.save({ session });

      await session.commitTransaction(); session.endSession();
      successCount++;
    } catch (err) {
      await session.abortTransaction(); session.endSession();
      console.error(`bulkEmiUpload error [${vendorNo}]:`, err.message);
      errors.push(`Vendor No ${vendorNo}: ${err.message}`); skipCount++;
    }
  }

  const allFailed = successCount === 0;
  return res.status(allFailed ? 422 : 200).json({
    success: !allFailed,
    message: `EMI batch complete. Processed: ${successCount}, Skipped: ${skipCount}.`,
    results: { successCount, skipCount, errorCount: errors.length, errors },
  });
};


module.exports = { getMyTransactions, bulkSharesUpload, bulkEmiUpload };