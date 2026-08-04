const Loan = require("../models/Loan");
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User'); 
const LedgerService = require('../services/LedgerService'); 
const { v4: uuidv4 } = require("uuid");

exports.requestLoan = async (req, res) => {
  try {
    const { memberId, loanAmount, interestRate, endDate } = req.body;

    const user = await User.findById(memberId);
    if (!user) return res.status(404).json({ error: "Member not found." });

    if (user.dateOfRetirement && new Date(endDate) > new Date(user.dateOfRetirement)) {
      return res.status(400).json({ error: "Loan end date cannot exceed the member's Date of Retirement." });
    }

    const loan = new Loan({ memberId, loanAmount, interestRate, endDate });
    await loan.save();

    res.status(201).json({ message: "Loan request submitted successfully!", loan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getLoans = async (req, res) => {
  try {
    const loans = await Loan.find().populate("memberId", "name firstName lastName email vendorNo"); 
    res.status(200).json(loans);
  } catch (error) {
    console.error("CRITICAL ERROR in getLoans:", error); 
    res.status(500).json({ error: error.message });
  }
};

exports.updateLoanStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, shareDeductionAmount, sharePaymentMethod } = req.body; 

    let loan = await Loan.findOne({ loanId: id });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found in database!" });
    }

    const isNewlyApproved = status === "APPROVED" && loan.status !== "APPROVED";
    
    // Fallback to the method saved during application, or default to deducting from loan
    const paymentMethod = sharePaymentMethod || loan.sharePaymentMethod || 'DEDUCT_FROM_LOAN';
    const fetchedUser = await User.findById(loan.memberId);
    
    const grossAmount = loan.loanAmount;
    const finalShareDeduction = shareDeductionAmount || (grossAmount * 0.10); 

    // --- CRITICAL BALANCE CHECK BEFORE APPROVING ---
    if (isNewlyApproved && paymentMethod === 'RD_BALANCE') {
      if (!fetchedUser || (fetchedUser.rdBalance || 0) < finalShareDeduction) {
        return res.status(400).json({ 
          error: `Insufficient RD Balance. Needed: ₹${finalShareDeduction.toLocaleString('en-IN')}, Available: ₹${(fetchedUser?.rdBalance || 0).toLocaleString('en-IN')}` 
        });
      }
    }

    // Save Loan Status
    loan.status = status;
    await loan.save();

    // --- LEDGER & MONEY MOVEMENT ---
    if (isNewlyApproved) {
      const batchId = `BATCH-${uuidv4()}`;
      const exactVendorNo = fetchedUser && fetchedUser.vendorNo ? fetchedUser.vendorNo : "SYS-LOAN-AUTO";
      const exactMemberName = fetchedUser ? (fetchedUser.name || `${fetchedUser.firstName || ''} ${fetchedUser.lastName || ''}`.trim() || 'Unknown Member') : "System Auto";

      let netPayout = grossAmount; // Default assumes we pay out the full amount
      const transactionsToLog = [];

      // 1. CORE LOAN DISBURSEMENT (Always happens)
      transactionsToLog.push({
        vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '152', memberId: loan.memberId,
        category: "LOAN_DISBURSEMENT", amount: grossAmount, entryType: "DEBIT", paymentMode: "INTERNAL_TRANSFER",
        transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
      });

      // 2. SHARE CAPITAL ROUTING logic based on chosen method
      if (paymentMethod === 'DEDUCT_FROM_LOAN') {
        netPayout = grossAmount - finalShareDeduction; // Reduce the payout
        
        transactionsToLog.push({
          vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '155', memberId: loan.memberId,
          category: "SHARE_CAPITAL", amount: finalShareDeduction, entryType: "CREDIT", paymentMode: "LOAN_DEDUCTION",
          transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
        });

      } else if (paymentMethod === 'RD_BALANCE') {
        // Physically deduct from user's RD and add to their Share Capital
        fetchedUser.rdBalance -= finalShareDeduction;
        fetchedUser.currentShareMoneyTotal = (fetchedUser.currentShareMoneyTotal || 0) + finalShareDeduction;
        await fetchedUser.save();

        transactionsToLog.push(
          // Debit (Reduce) RD Balance
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '154', memberId: loan.memberId,
            category: "RD_OFFSET_FOR_SHARES", amount: finalShareDeduction, entryType: "DEBIT", paymentMode: "CONTRA_ADJUSTMENT",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          },
          // Credit (Increase) Share Capital
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '155', memberId: loan.memberId,
            category: "SHARE_CAPITAL", amount: finalShareDeduction, entryType: "CREDIT", paymentMode: "CONTRA_ADJUSTMENT",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          }
        );

      } else if (paymentMethod === 'CASH_UPI') {
        transactionsToLog.push(
          // Debit (Increase) Society Bank/Cash Account
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '101', memberId: loan.memberId,
            category: "BANK_RECEIPT", amount: finalShareDeduction, entryType: "DEBIT", paymentMode: "CASH_UPI",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          },
          // Credit (Increase) Share Capital
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '155', memberId: loan.memberId,
            category: "SHARE_CAPITAL", amount: finalShareDeduction, entryType: "CREDIT", paymentMode: "CASH_UPI",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          }
        );
      }

      // 3. FINAL BANK PAYOUT ENTRY
      transactionsToLog.push({
        vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '151', memberId: loan.memberId,
        category: "BANK_PAYOUT", amount: netPayout, entryType: "CREDIT", paymentMode: "PAYOUT_GATEWAY",
        transactionId: `TXN-${uuidv4()}`, status: "PENDING", relatedLoanId: loan._id, batchId: batchId
      });

      // Execute Ledger Entries
      const LedgerService = require('../services/LedgerService'); 
      await LedgerService.executeDoubleEntry(transactionsToLog, `Loan Disbursement Approved - Share via ${paymentMethod.replace(/_/g, ' ')}`);
    }

    res.status(200).json({ message: "Loan status updated and ledger entries created!", loan });
  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.applyForLoan = async (req, res) => {
  try {
    const { requestedAmount, tenure, purpose, sharePaymentMethod } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User token is missing." });
    }
    
    const memberId = req.user.id || req.user._id || req.user.userId; 

    if (!memberId) {
      return res.status(400).json({ error: "Could not extract valid member ID from token." });
    }

    const user = await User.findById(memberId);
    if (!user) return res.status(404).json({ error: "Member not found." });

    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + Number(tenure));

    if (user.dateOfRetirement && endDate > new Date(user.dateOfRetirement)) {
      return res.status(400).json({ error: "Requested loan tenure exceeds your Date of Retirement." });
    }

    const existingLoansCount = await Loan.countDocuments({ memberId: memberId });
    const nextSequence = existingLoansCount + 1; 
    const loanId = `${user.vendorNo}-${nextSequence}`;

    const newApplication = new Loan({
      loanId: loanId,
      memberId: memberId,
      loanAmount: requestedAmount,
      tenure: tenure,
      purpose: purpose,
      sharePaymentMethod: sharePaymentMethod,
      endDate: endDate,
      status: "PENDING"
    });

    await newApplication.save();

    res.status(201).json({ message: "Application submitted successfully", loan: newApplication });
  } catch (error) {
    console.error("Apply Loan Error:", error);
    res.status(500).json({ error: "Server error while processing application." });
  }
};

const PENALTY_CONFIG = {
  applyPenalty: true,        
  type: 'FLAT',            
  flatAmount: 200,          
  percentageRate: 0.02      
};

exports.processEMI = async (req, res) => {
  try {
    const { vendorNo, emiAmount, annualInterestRate, isLatePayment, paymentMode, paymentDate, referenceNumber, documentProofUrl } = req.body;
    
    const LOAN_PRINCIPAL_FOLIO = '152'; 
    const LOAN_INTEREST_FOLIO = '153';  
    const BANK_RECEIPT_FOLIO = '101'; 

    if (!vendorNo || !emiAmount || !annualInterestRate || !paymentMode) {
      return res.status(400).json({ success: false, message: "Missing required EMI fields including Payment Mode." });
    }

    // The exact word the Admin dashboard is looking for!
    const txStatus = 'PENDING';

    const loanTransactions = await TransactionLog.find({ 
      vendorNo: vendorNo, 
      ledgerFolio: LOAN_PRINCIPAL_FOLIO, 
      status: 'COMPLETED' 
    });

    let outstandingPrincipal = 0;
    loanTransactions.forEach(trx => {
      if (trx.entryType === 'DEBIT') {
        outstandingPrincipal += trx.amount; 
      } else if (trx.entryType === 'CREDIT' && (trx.category === 'LOAN_REPAYMENT' || trx.category === 'CONTRA_ADJUSTMENT')) {
        outstandingPrincipal -= trx.amount; 
      }
    });

    if (outstandingPrincipal <= 0) {
      return res.status(400).json({ success: false, message: "No active loan balance found for this member." });
    }

    const monthlyRate = (annualInterestRate / 100) / 12;
    const interestForMonth = parseFloat((outstandingPrincipal * monthlyRate).toFixed(2));

    let principalRepayment = parseFloat((emiAmount - interestForMonth).toFixed(2));
    let isFinalSettlement = false;
    
    if (principalRepayment >= outstandingPrincipal) {
      principalRepayment = outstandingPrincipal;
      isFinalSettlement = true;
    }

    if (principalRepayment < 0) {
       return res.status(400).json({ success: false, message: "EMI amount must cover the monthly interest due." });
    }

    let penaltyAmount = 0;
    if (isLatePayment && PENALTY_CONFIG.applyPenalty && !isFinalSettlement) {
      penaltyAmount = PENALTY_CONFIG.type === 'FLAT' 
        ? PENALTY_CONFIG.flatAmount 
        : parseFloat((emiAmount * PENALTY_CONFIG.percentageRate).toFixed(2));
    }

    const totalDebitAmount = emiAmount + penaltyAmount;

    const newTransactions = [];
    const batchId = `EMI-${uuidv4()}`;
    const targetMemberId = loanTransactions[0].memberId;

    const fetchedUserEmi = await User.findById(targetMemberId);
    const exactMemberNameEmi = fetchedUserEmi ? (fetchedUserEmi.name || `${fetchedUserEmi.firstName || ''} ${fetchedUserEmi.lastName || ''}`.trim() || 'Unknown Member') : "-";

    const baseTx = {
      vendorNo: vendorNo,
      memberName: exactMemberNameEmi, 
      memberId: targetMemberId,
      status: txStatus,
      batchId: batchId,
      referenceNumber: referenceNumber || null,
      transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
      documentProofUrl: documentProofUrl || null
    };

    newTransactions.push({
      ...baseTx,
      ledgerFolio: BANK_RECEIPT_FOLIO,
      category: 'BANK_RECEIPT',
      amount: totalDebitAmount,
      entryType: 'DEBIT',
      paymentMode: paymentMode,
      transactionId: `BANK-IN-${uuidv4()}`
    });

    newTransactions.push({
      ...baseTx,
      ledgerFolio: LOAN_INTEREST_FOLIO, 
      category: 'LOAN_EMI',
      amount: interestForMonth,
      entryType: 'CREDIT', 
      paymentMode: 'INTERNAL_TRANSFER',
      transactionId: `LOAN-INT-${uuidv4()}`
    });

    if (principalRepayment > 0) {
      newTransactions.push({
        ...baseTx,
        ledgerFolio: LOAN_PRINCIPAL_FOLIO, 
        category: 'LOAN_REPAYMENT',
        amount: principalRepayment,
        entryType: 'CREDIT', 
        paymentMode: paymentMode, 
        transactionId: `LOAN-PRN-${uuidv4()}`
      });
    }

    if (penaltyAmount > 0) {
      newTransactions.push({
        ...baseTx,
        ledgerFolio: LOAN_PRINCIPAL_FOLIO, 
        category: 'PENALTY',
        amount: penaltyAmount,
        entryType: 'CREDIT', 
        paymentMode: paymentMode,
        transactionId: `PENALTY-${uuidv4()}`
      });
    }

    const description = isFinalSettlement ? 'Full & Final Principal Settlement' : `Monthly EMI Repayment (${paymentMode})`;
    const savedTransactions = await LedgerService.executeDoubleEntry(newTransactions, description);
    
    const newOutstandingBalance = parseFloat((outstandingPrincipal - principalRepayment).toFixed(2));

    if (txStatus === 'COMPLETED' && newOutstandingBalance <= 0) {
      await Loan.findOneAndUpdate(
        { memberId: targetMemberId, status: { $in: ['APPROVED', 'PENDING'] } }, 
        { status: 'CLOSED' }
      );
    }

    res.status(200).json({
      success: true,
      message: txStatus === 'PENDING_VERIFICATION' 
        ? 'Payment logged successfully. Awaiting Admin clearance (Cheque).' 
        : (isFinalSettlement ? 'Loan fully settled and closed.' : 'EMI Processed successfully.'),
      data: {
        transactionStatus: txStatus,
        totalEmiPaid: emiAmount,
        interestDeducted: interestForMonth,
        principalReduced: principalRepayment,
        newOutstandingBalance: txStatus === 'COMPLETED' ? newOutstandingBalance : outstandingPrincipal,
        penaltyApplied: penaltyAmount > 0,
        transactions: savedTransactions.map(t => t.transactionId)
      }
    });

  } catch (error) {
    console.error("Error processing EMI:", error);
    res.status(500).json({ success: false, message: error.message || "Server error processing EMI" });
  }
};

exports.getPendingTransactions = async (req, res) => {
  try {
    // 🟢 FIXED: Now fetches the full BANK_RECEIPT (Total Amount) instead of the capped Principal
    const pendingTxns = await TransactionLog.find({ 
      status: 'PENDING', 
      entryType: 'DEBIT',           // Changed from CREDIT to DEBIT
      category: 'BANK_RECEIPT'      // Changed from LOAN_REPAYMENT to BANK_RECEIPT
    })
      .populate('memberId', 'name vendorNo')
      .sort({ transactionDate: -1 });
    
    res.status(200).json({ success: true, data: pendingTxns });
  } catch (error) {
    console.error("Error fetching pending transactions:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending transactions." });
  }
};

exports.approvePendingTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await TransactionLog.findOne({ transactionId });
    if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found." });
    if (transaction.status === 'COMPLETED') return res.status(400).json({ success: false, message: "Transaction is already cleared." });

    transaction.status = 'COMPLETED';
    await transaction.save();

    await TransactionLog.updateMany(
      { batchId: transaction.batchId, status: 'PENDING_VERIFICATION' },
      { $set: { status: 'COMPLETED' } }
    );

    const loanTransactions = await TransactionLog.find({ 
      vendorNo: transaction.vendorNo, 
      ledgerFolio: '152', 
      status: 'COMPLETED' 
    });

    let outstandingPrincipal = 0;
    loanTransactions.forEach(trx => {
      if (trx.entryType === 'DEBIT') outstandingPrincipal += trx.amount; 
      else if (trx.entryType === 'CREDIT' && (trx.category === 'LOAN_REPAYMENT' || trx.category === 'CONTRA_ADJUSTMENT')) outstandingPrincipal -= trx.amount; 
    });

    let loanClosed = false;
    if (outstandingPrincipal <= 0) {
      await Loan.findOneAndUpdate(
        { memberId: transaction.memberId, status: { $in: ['APPROVED', 'PENDING'] } }, 
        { status: 'CLOSED' }
      );
      loanClosed = true;
    }

    res.status(200).json({ 
      success: true, 
      message: "Cheque cleared and ledger officially updated.",
      loanClosed: loanClosed
    });
  } catch (error) {
    console.error("Error approving transaction:", error);
    res.status(500).json({ success: false, message: "Server error during approval." });
  }
};

exports.rejectPendingTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { reason } = req.body; 
    
    const transaction = await TransactionLog.findOne({ transactionId });
    if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found." });
    if (transaction.status !== 'PENDING') return res.status(400).json({ success: false, message: "Only pending transactions can be rejected." });

    // Update the Bank Receipt, Interest, and Principal ledgers for this batch to REJECTED
    await TransactionLog.updateMany(
      { batchId: transaction.batchId, status: 'PENDING' },
      { $set: { 
          status: 'REJECTED', 
          remarks: reason ? `Rejected by Admin: ${reason}` : 'Rejected by Admin' 
        } 
      }
    );

    res.status(200).json({ 
      success: true, 
      message: "Transaction safely rejected and removed from queue." 
    });
  } catch (error) {
    console.error("Error rejecting transaction:", error);
    res.status(500).json({ success: false, message: "Server error during rejection." });
  }
};

exports.getMyLoanStatement = async (req, res) => {
  try {
    const memberId = req.user.id || req.user._id || req.user.userId;
    const loans = await Loan.find({ memberId: memberId, status: { $in: ['APPROVED', 'ACTIVE', 'CLOSED'] } });
    
    res.status(200).json({ success: true, data: loans });
  } catch (error) {
    console.error("Error fetching member loan:", error);
    res.status(500).json({ success: false, message: "Failed to fetch your loan statement." });
  }
};

exports.settleLoanWithSavings = async (req, res) => {
  try {
    const { loanId, vendorNo, settlementSource, amountToAdjust } = req.body; 

    if (!loanId || !vendorNo || !settlementSource || !amountToAdjust || Number(amountToAdjust) <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payload parameters provided." });
    }

    const numericAmount = Number(amountToAdjust);

    const user = await User.findOne({ vendorNo });
    const loan = await Loan.findOne({ loanId, vendorNo });

    if (!user || !loan) {
      return res.status(404).json({ success: false, message: "User or Loan record not found." });
    }

    if (loan.status === 'CLOSED') {
      return res.status(400).json({ success: false, message: "This loan is already closed." });
    }

    let currentSourceBalance = 0;
    if (settlementSource === 'RD_BALANCE') {
      currentSourceBalance = user.rdBalance || 0; 
    } else if (settlementSource === 'SHARE_CAPITAL') {
      currentSourceBalance = user.currentShareMoneyTotal || 0;
    } else {
      return res.status(400).json({ success: false, message: "Invalid settlement source selected." });
    }

    if (numericAmount > currentSourceBalance) {
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient balance. Member only has ₹${currentSourceBalance} in ${settlementSource === 'RD_BALANCE' ? 'Recurring Deposit' : 'Share Capital'}.` 
      });
    }

    const loanTransactions = await TransactionLog.find({ 
      vendorNo: vendorNo, 
      ledgerFolio: '152', 
      status: 'COMPLETED' 
    });

    let outstandingPrincipal = 0;
    loanTransactions.forEach(trx => {
      if (trx.entryType === 'DEBIT') {
        outstandingPrincipal += trx.amount; 
      } else if (trx.entryType === 'CREDIT' && (trx.category === 'LOAN_REPAYMENT' || trx.category === 'CONTRA_ADJUSTMENT')) {
        outstandingPrincipal -= trx.amount; 
      }
    });

    if (numericAmount > outstandingPrincipal) {
      return res.status(400).json({ 
        success: false, 
        message: `Adjustment amount (₹${numericAmount}) exceeds remaining loan principal (₹${outstandingPrincipal}).` 
      });
    }

    const batchId = `CONTRA-${uuidv4()}`;
    const savingsFolio = settlementSource === 'SHARE_CAPITAL' ? '155' : '154'; 
    const memberName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown Member';

    const contraTransactions = [
      {
        vendorNo: user.vendorNo,
        memberName: memberName,
        ledgerFolio: savingsFolio,
        memberId: user._id,
        category: settlementSource === 'SHARE_CAPITAL' ? 'SHARE_LOAN_OFFSET' : 'RD_LOAN_OFFSET',
        amount: numericAmount,
        entryType: 'DEBIT',
        paymentMode: 'CONTRA_ADJUSTMENT',
        transactionId: `CONTRA-DR-${uuidv4()}`,
        status: 'COMPLETED',
        batchId: batchId
      },
      {
        vendorNo: user.vendorNo,
        memberName: memberName,
        ledgerFolio: '152', 
        memberId: user._id,
        category: 'CONTRA_ADJUSTMENT',
        amount: numericAmount,
        entryType: 'CREDIT',
        paymentMode: 'CONTRA_ADJUSTMENT',
        transactionId: `CONTRA-CR-${uuidv4()}`,
        status: 'COMPLETED',
        relatedLoanId: loan._id,
        batchId: batchId
      }
    ];

    await LedgerService.executeDoubleEntry(contraTransactions, `Loan ${loanId} settled using ${settlementSource.replace('_', ' ')}`);

    if (settlementSource === 'RD_BALANCE') {
      user.rdBalance -= numericAmount;
    } else {
      user.currentShareMoneyTotal -= numericAmount;
    }
    await user.save();

    const newOutstanding = parseFloat((outstandingPrincipal - numericAmount).toFixed(2));
    let isFullyClosed = false;
    if (newOutstanding <= 0) {
      loan.status = 'CLOSED';
      await loan.save();
      isFullyClosed = true;
    }

    res.status(200).json({
      success: true,
      message: `Successfully offset ₹${numericAmount} from ${settlementSource.replace('_', ' ')}. ${isFullyClosed ? 'Loan has been fully closed.' : ''}`,
      data: { remainingLoanBalance: newOutstanding, loanStatus: loan.status }
    });

  } catch (error) {
    console.error("Loan Settlement Error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error processing loan offset." });
  }
};

exports.getMemberBalancesForSettlement = async (req, res) => {
  try {
    const { vendorNo, loanId } = req.params;

    const user = await User.findOne({ vendorNo });
    if (!user) {
      return res.status(404).json({ success: false, message: "Member not found with this Vendor Number." });
    }

    const loan = await Loan.findOne({ loanId, vendorNo });
    if (!loan) {
      return res.status(404).json({ success: false, message: "Loan ID not found for this vendor." });
    }

    const loanTransactions = await TransactionLog.find({ 
      vendorNo: vendorNo, 
      ledgerFolio: '152', 
      status: 'COMPLETED' 
    });

    let outstandingPrincipal = 0;
    loanTransactions.forEach(trx => {
      if (trx.entryType === 'DEBIT') {
        outstandingPrincipal += trx.amount; 
      } else if (trx.entryType === 'CREDIT' && (trx.category === 'LOAN_REPAYMENT' || trx.category === 'CONTRA_ADJUSTMENT')) {
        outstandingPrincipal -= trx.amount; 
      }
    });

    res.status(200).json({
      success: true,
      data: {
        memberName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
        outstandingPrincipal: outstandingPrincipal,
        rdBalance: user.rdBalance || 0,
        shareCapital: user.currentShareMoneyTotal || 0,
        loanStatus: loan.status
      }
    });

  } catch (error) {
    console.error("Error fetching settlement balances:", error);
    res.status(500).json({ success: false, message: "Server error fetching member balances." });
  }
};

exports.generateDemandSheet = async (req, res) => {
  try {
    const users = await User.find({}); 
    const demandList = [];

    for (const user of users) {
      const rdMonthly = user.monthlyRdContribution || user.rdAmount || 0; 

      const activeLoans = await Loan.find({ 
        vendorNo: user.vendorNo, 
        status: { $in: ['APPROVED', 'ACTIVE'] } 
      });

      let loanDemand = 0;
      const activeLoanIds = [];

      for (const loan of activeLoans) {
        const emi = loan.emiAmount || loan.monthlyEMI || 0;
        
        loanDemand += emi;
        activeLoanIds.push(loan.loanId);
      }

      if (rdMonthly > 0 || loanDemand > 0) {
        demandList.push({
          vendorNo: user.vendorNo,
          memberName: user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
          rdMonthly: rdMonthly,
          loanDemand: loanDemand,
          activeLoanIds: activeLoanIds.join(', ') || 'N/A',
          totalDeduction: rdMonthly + loanDemand
        });
      }
    }

    res.status(200).json({ success: true, data: demandList });

  } catch (error) {
    console.error("Demand Sheet Error:", error);
    res.status(500).json({ success: false, message: "Server error generating demand sheet." });
  }
};

exports.getMyLoan = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    const loan = await Loan.findOne({ 
      memberId: userId, 
      status: { $in: ['PENDING', 'APPROVED', 'ACTIVE'] } 
    }).sort({ createdAt: -1 });
    
    res.status(200).json({ loan });
  } catch (error) {
    console.error("Get My Loan Error:", error);
    res.status(500).json({ error: "Failed to fetch loan data." });
  }
};