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
    // INJECTED: Added the Admin overrides and UTR/Cheque references here
    const { status, shareDeductionAmount, sharePaymentMethod, transferMode, referenceNumber, approvedAmount, interestRate, tenure } = req.body; 

    let loan = await Loan.findOne({ loanId: id });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found in database!" });
    }

    const isNewlyApproved = status === "APPROVED" && loan.status !== "APPROVED";
    
    const paymentMethod = sharePaymentMethod || loan.sharePaymentMethod || 'DEDUCT_FROM_LOAN';
    const fetchedUser = await User.findById(loan.memberId);
    
    if (approvedAmount) loan.loanAmount = approvedAmount;
    if (interestRate) loan.interestRate = interestRate;
    if (tenure) {
      loan.tenure = tenure;
      // Re-calculate endDate based on new tenure to validate against retirement
      const newEndDate = new Date();
      newEndDate.setMonth(newEndDate.getMonth() + Number(tenure));
      loan.endDate = newEndDate;

      if (fetchedUser && fetchedUser.dateOfRetirement && newEndDate > new Date(fetchedUser.dateOfRetirement)) {
        return res.status(400).json({ error: "Approved loan tenure exceeds the member's Date of Retirement. Please reduce the tenure or increase EMI." });
      }
    }

    const grossAmount = loan.loanAmount;
    const finalShareDeduction = shareDeductionAmount || (grossAmount * 0.10); 

    if (isNewlyApproved && paymentMethod === 'RD_BALANCE') {
      if (!fetchedUser || (fetchedUser.rdBalance || 0) < finalShareDeduction) {
        return res.status(400).json({ 
          error: `Insufficient RD Balance. Needed: ₹${finalShareDeduction.toLocaleString('en-IN')}, Available: ₹${(fetchedUser?.rdBalance || 0).toLocaleString('en-IN')}` 
        });
      }
    }

    loan.status = status;
    if (isNewlyApproved) {
      loan.disbursalDate = new Date();
      loan.disbursalReference = referenceNumber || null;
      loan.disbursalMode = transferMode || null;
    }
    await loan.save();

    if (isNewlyApproved) {
      const batchId = `BATCH-${uuidv4()}`;
      const exactVendorNo = fetchedUser && fetchedUser.vendorNo ? fetchedUser.vendorNo : "SYS-LOAN-AUTO";
      const exactMemberName = fetchedUser ? (fetchedUser.name || `${fetchedUser.firstName || ''} ${fetchedUser.lastName || ''}`.trim() || 'Unknown Member') : "System Auto";

      let netPayout = grossAmount; 
      const transactionsToLog = [];

      transactionsToLog.push({
        vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '152', memberId: loan.memberId,
        category: "LOAN_DISBURSEMENT", amount: grossAmount, entryType: "DEBIT", paymentMode: "INTERNAL_TRANSFER",
        transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
      });

      if (paymentMethod === 'DEDUCT_FROM_LOAN') {
        netPayout = grossAmount - finalShareDeduction; 
        
        transactionsToLog.push({
          vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '155', memberId: loan.memberId,
          category: "SHARE_CAPITAL", amount: finalShareDeduction, entryType: "CREDIT", paymentMode: "LOAN_DEDUCTION",
          transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
        });

      } else if (paymentMethod === 'RD_BALANCE') {
        fetchedUser.rdBalance -= finalShareDeduction;
        fetchedUser.currentShareMoneyTotal = (fetchedUser.currentShareMoneyTotal || 0) + finalShareDeduction;
        await fetchedUser.save();

        transactionsToLog.push(
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '154', memberId: loan.memberId,
            category: "RD_OFFSET_FOR_SHARES", amount: finalShareDeduction, entryType: "DEBIT", paymentMode: "CONTRA_ADJUSTMENT",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          },
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '155', memberId: loan.memberId,
            category: "SHARE_CAPITAL", amount: finalShareDeduction, entryType: "CREDIT", paymentMode: "CONTRA_ADJUSTMENT",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          }
        );

      } else if (paymentMethod === 'CASH_UPI') {
        transactionsToLog.push(
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '101', memberId: loan.memberId,
            category: "BANK_RECEIPT", amount: finalShareDeduction, entryType: "DEBIT", paymentMode: "CASH_UPI",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          },
          {
            vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '155', memberId: loan.memberId,
            category: "SHARE_CAPITAL", amount: finalShareDeduction, entryType: "CREDIT", paymentMode: "CASH_UPI",
            transactionId: `TXN-${uuidv4()}`, status: "COMPLETED", relatedLoanId: loan._id, batchId: batchId
          }
        );
      }

      // INJECTED: Now maps the Cheque/UPI details directly to the outgoing Bank Payout entry
      transactionsToLog.push({
        vendorNo: exactVendorNo, memberName: exactMemberName, ledgerFolio: '151', memberId: loan.memberId,
        category: "BANK_PAYOUT", amount: netPayout, entryType: "CREDIT", 
        paymentMode: transferMode || "PAYOUT_GATEWAY",
        referenceNumber: referenceNumber || null,
        transactionId: `TXN-${uuidv4()}`, 
        status: referenceNumber ? "COMPLETED" : "PENDING", 
        relatedLoanId: loan._id, batchId: batchId
      });

      // Update User object balances & EMI dates on approval
      if (fetchedUser) {
        fetchedUser.activeLoanAmount = (fetchedUser.activeLoanAmount || 0) + grossAmount;
        fetchedUser.pendingLoanBalance = (fetchedUser.pendingLoanBalance || 0) + grossAmount;
        
        const monthlyRate = ((loan.interestRate || 10) / 100) / 12;
        const totalMonths = loan.tenure || 12;
        // Simple EMI estimate for caching (can be overridden manually)
        fetchedUser.monthlyEmiAmount = Math.round((grossAmount * monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1));
        
        fetchedUser.emiStartDate = new Date();
        const endD = new Date();
        endD.setMonth(endD.getMonth() + totalMonths);
        fetchedUser.emiEndDate = endD;
        
        const nextD = new Date();
        nextD.setMonth(nextD.getMonth() + 1);
        fetchedUser.nextEmiDueDate = nextD;

        await fetchedUser.save();
      }

      const LedgerService = require('../services/LedgerService'); 
      await LedgerService.executeDoubleEntry(transactionsToLog, `Loan Disbursement Approved - Share via ${paymentMethod.replace(/_/g, ' ')}`);
    }

    // Send Email Notification
    if (fetchedUser && fetchedUser.emailId && (status === 'APPROVED' || status === 'REJECTED')) {
      const { sendLoanNotification } = require('../utils/emailService');
      sendLoanNotification(fetchedUser.emailId, fetchedUser.name, grossAmount, status);
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
    const { vendorNo, emiAmount, annualInterestRate, isLatePayment, paymentMode, paymentDate, referenceNumber, documentProofUrl, remarks } = req.body;
    
    const LOAN_PRINCIPAL_FOLIO = '152'; 
    const LOAN_INTEREST_FOLIO = '153';  
    const BANK_RECEIPT_FOLIO = '101'; 

    if (!vendorNo || !emiAmount || !paymentMode) {
      return res.status(400).json({ success: false, message: "Missing required EMI fields including Payment Mode." });
    }

    const txStatus = 'PENDING_VERIFICATION'; 

    const fetchedUserEmi = await User.findOne({ vendorNo });
    if (!fetchedUserEmi) {
      return res.status(404).json({ success: false, message: "Member not found." });
    }
    const targetMemberId = fetchedUserEmi._id;

    // Fetch all active/approved loans for the member, oldest first (FIFO)
    const activeLoans = await Loan.find({
      memberId: targetMemberId,
      status: { $in: ['APPROVED', 'ACTIVE'] }
    }).sort({ startDate: 1 });

    const loanTransactions = await TransactionLog.find({ 
      vendorNo: vendorNo, 
      ledgerFolio: LOAN_PRINCIPAL_FOLIO, 
      status: 'COMPLETED' 
    });

    // Calculate outstanding per loan
    const outstandingByLoan = {};
    let totalOutstanding = 0;
    loanTransactions.forEach(trx => {
      const relId = trx.relatedLoanId ? trx.relatedLoanId.toString() : 'UNKNOWN';
      if (!outstandingByLoan[relId]) outstandingByLoan[relId] = 0;
      
      if (trx.entryType === 'DEBIT') {
        outstandingByLoan[relId] += trx.amount; 
        totalOutstanding += trx.amount;
      } else if (trx.entryType === 'CREDIT' && (trx.category === 'LOAN_REPAYMENT' || trx.category === 'CONTRA_ADJUSTMENT')) {
        outstandingByLoan[relId] -= trx.amount; 
        totalOutstanding -= trx.amount;
      }
    });

    if (totalOutstanding <= 0) {
      return res.status(400).json({ success: false, message: "No active loan balance found for this member." });
    }

    let penaltyAmount = 0;
    // We omit isFinalSettlement logic for penalty since it's now distributed, but we can check if totalEMI clears totalOutstanding
    if (isLatePayment && PENALTY_CONFIG.applyPenalty && emiAmount < totalOutstanding) {
      penaltyAmount = PENALTY_CONFIG.type === 'FLAT' 
        ? PENALTY_CONFIG.flatAmount 
        : parseFloat((emiAmount * PENALTY_CONFIG.percentageRate).toFixed(2));
    }

    const totalDebitAmount = emiAmount + penaltyAmount;

    const newTransactions = [];
    const batchId = `EMI-${uuidv4()}`;
    const exactMemberNameEmi = fetchedUserEmi.name || `${fetchedUserEmi.firstName || ''} ${fetchedUserEmi.lastName || ''}`.trim() || 'Unknown Member';

    const baseTx = {
      vendorNo: vendorNo,
      memberName: exactMemberNameEmi, 
      memberId: targetMemberId,
      status: txStatus,
      batchId: batchId,
      referenceNumber: referenceNumber || null,
      remarks: remarks || null, 
      transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
      documentProofUrl: documentProofUrl || null
    };

    // 1. Log Bank Receipt for total amount
    newTransactions.push({
      ...baseTx,
      ledgerFolio: BANK_RECEIPT_FOLIO,
      category: 'BANK_RECEIPT',
      amount: totalDebitAmount,
      entryType: 'DEBIT',
      paymentMode: paymentMode,
      transactionId: `BANK-IN-${uuidv4()}`
    });

    // 2. Log Penalty (if any)
    if (penaltyAmount > 0) {
      newTransactions.push({
        ...baseTx,
        ledgerFolio: LOAN_PRINCIPAL_FOLIO, // Keep existing folio or change if PENALTY uses '157'
        category: 'PENALTY',
        amount: penaltyAmount,
        entryType: 'CREDIT', 
        paymentMode: paymentMode,
        transactionId: `PENALTY-${uuidv4()}`
      });
    }

    // 3. FIFO Distribution of emiAmount across active loans
    let remainingEMI = emiAmount;
    let totalInterestDeducted = 0;
    let totalPrincipalReduced = 0;

    for (const loan of activeLoans) {
      if (remainingEMI <= 0) break;

      let outstanding = outstandingByLoan[loan._id.toString()] || 0;
      // If there are legacy transactions without relatedLoanId, apply them to the oldest loan
      if (outstandingByLoan['UNKNOWN'] && outstandingByLoan['UNKNOWN'] !== 0) {
        outstanding += outstandingByLoan['UNKNOWN'];
        outstandingByLoan['UNKNOWN'] = 0; // Clear it out after applying
      }

      if (outstanding <= 0) {
        if (txStatus === 'COMPLETED') {
          await Loan.findByIdAndUpdate(loan._id, { status: 'CLOSED' });
        }
        continue;
      }

      const loanInterestRate = loan.interestRate || annualInterestRate || 10;
      const monthlyRate = (loanInterestRate / 100) / 12;
      const interestForMonth = parseFloat((outstanding * monthlyRate).toFixed(2));

      let interestPaid = 0;
      let principalPaid = 0;

      if (remainingEMI >= interestForMonth) {
        interestPaid = interestForMonth;
        remainingEMI -= interestPaid;
        principalPaid = Math.min(remainingEMI, outstanding);
        remainingEMI -= principalPaid;
      } else {
        interestPaid = remainingEMI;
        remainingEMI = 0;
      }

      if (interestPaid > 0) {
        newTransactions.push({
          ...baseTx,
          ledgerFolio: LOAN_INTEREST_FOLIO, 
          category: 'LOAN_EMI',
          amount: parseFloat(interestPaid.toFixed(2)),
          entryType: 'CREDIT', 
          paymentMode: 'INTERNAL_TRANSFER',
          transactionId: `LOAN-INT-${uuidv4()}`,
          relatedLoanId: loan._id
        });
        totalInterestDeducted += interestPaid;
      }

      if (principalPaid > 0) {
        newTransactions.push({
          ...baseTx,
          ledgerFolio: LOAN_PRINCIPAL_FOLIO, 
          category: 'LOAN_REPAYMENT',
          amount: parseFloat(principalPaid.toFixed(2)),
          entryType: 'CREDIT', 
          paymentMode: paymentMode, 
          transactionId: `LOAN-PRN-${uuidv4()}`,
          relatedLoanId: loan._id
        });
        totalPrincipalReduced += principalPaid;
        outstanding -= principalPaid;
      }

      if (outstanding <= 0 && txStatus === 'COMPLETED') {
        await Loan.findByIdAndUpdate(loan._id, { status: 'CLOSED' });
      }
    }

    const description = `Monthly EMI Repayment (${paymentMode}) - Multi-Loan FIFO`;
    const savedTransactions = await LedgerService.executeDoubleEntry(newTransactions, description);
    
    // Send Email Receipt
    if (fetchedUserEmi && fetchedUserEmi.emailId) {
      const { sendReceipt } = require('../utils/emailService');
      const txnId = savedTransactions?.[0]?.transactionId || null;
      sendReceipt(fetchedUserEmi.emailId, fetchedUserEmi.name, totalDebitAmount, 'EMI_REPAYMENT', 'CREDIT', txnId);
    }

    const newOutstandingBalance = parseFloat((totalOutstanding - totalPrincipalReduced).toFixed(2));

    if (txStatus === 'COMPLETED') {
      fetchedUserEmi.pendingLoanBalance = newOutstandingBalance;
      if (newOutstandingBalance <= 0) {
        fetchedUserEmi.activeLoanAmount = 0;
        fetchedUserEmi.nextEmiDueDate = null;
        fetchedUserEmi.emiStartDate = null;
        fetchedUserEmi.emiEndDate = null;
        fetchedUserEmi.defaulterStatus = false;
      } else {
        if (fetchedUserEmi.nextEmiDueDate) {
          const nextD = new Date(fetchedUserEmi.nextEmiDueDate);
          nextD.setMonth(nextD.getMonth() + 1);
          fetchedUserEmi.nextEmiDueDate = nextD;
        }
        fetchedUserEmi.defaulterStatus = false;
      }
      await fetchedUserEmi.save();
    }

    res.status(200).json({
      success: true,
      message: txStatus === 'PENDING_VERIFICATION' 
        ? 'Payment logged successfully. Awaiting Admin clearance (Cheque).' 
        : (newOutstandingBalance <= 0 ? 'Loan(s) fully settled and closed.' : 'EMI Processed successfully.'),
      data: {
        transactionStatus: txStatus,
        totalEmiPaid: emiAmount,
        interestDeducted: totalInterestDeducted,
        principalReduced: totalPrincipalReduced,
        newOutstandingBalance: txStatus === 'COMPLETED' ? newOutstandingBalance : totalOutstanding,
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
    const pendingTxns = await TransactionLog.find({ 
      status: { $in: ['PENDING', 'PENDING_VERIFICATION'] }, 
      // 👇 Removed strict DEBIT rule to allow CREDIT payouts
      category: { $in: ['BANK_RECEIPT', 'BANK_PAYOUT'] }      
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
      { batchId: transaction.batchId, status: 'PENDING' },
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

exports.getMyLoans = async (req, res) => {
  try {
    let targetUserId = req.user.id || req.user._id;

    if ((req.user.role === 'admin' || req.user.role === 'executive') && (req.query.vendorNo || req.query.memberId)) {
      if (req.query.memberId) {
        targetUserId = req.query.memberId;
      } else if (req.query.vendorNo) {
        const foundUser = await User.findOne({ vendorNo: req.query.vendorNo });
        if (foundUser) targetUserId = foundUser._id;
      }
    }
    
    const loans = await Loan.find({ 
      memberId: targetUserId
    }).sort({ createdAt: -1 });
    
    res.status(200).json({ loans });
  } catch (error) {
    console.error("Get My Loans Error:", error);
    res.status(500).json({ error: "Failed to fetch loans data." });
  }
};

// ==========================================
// DEPRECATED ROUTE (Leave safely untouched)
// ==========================================
exports.approveDisbursement = async (req, res) => {
  try {
    const { loanId, approvedAmount, interestRate, tenure, transferMode, referenceNumber } = req.body;

    const loan = await Loan.findOne({ loanId: loanId }).populate('memberId');
    if (!loan) return res.status(404).json({ success: false, message: "Loan application not found." });
    if (loan.status === 'ACTIVE') return res.status(400).json({ success: false, message: "Loan is already active." });

    loan.loanAmount = approvedAmount;
    loan.principalPending = approvedAmount;
    loan.interestRate = interestRate;
    loan.tenure = tenure;
    loan.status = 'ACTIVE';
    loan.disbursalDate = new Date();
    loan.disbursalReference = referenceNumber;
    loan.disbursalMode = transferMode;

    const monthlyRate = (interestRate / 100) / 12;
    loan.emiAmount = Math.round((approvedAmount * monthlyRate * Math.pow(1 + monthlyRate, tenure)) / (Math.pow(1 + monthlyRate, tenure) - 1));
    
    await loan.save();

    const disbursalEntries = [
      {
        vendorNo: loan.memberId.vendorNo,
        memberName: loan.memberId.name,
        memberId: loan.memberId._id,
        ledgerFolio: '152', 
        category: 'LOAN_DISBURSAL',
        amount: approvedAmount,
        entryType: 'DEBIT',
        paymentMode: transferMode,
        referenceNumber: referenceNumber,
        transactionDate: new Date(),
        transactionId: `LOAN-OUT-${Date.now()}`
      },
      {
        vendorNo: loan.memberId.vendorNo,
        memberName: loan.memberId.name,
        memberId: loan.memberId._id,
        ledgerFolio: '151', 
        category: 'BANK_PAYMENT',
        amount: approvedAmount,
        entryType: 'CREDIT',
        paymentMode: transferMode,
        referenceNumber: referenceNumber,
        transactionDate: new Date(),
        transactionId: `BANK-CR-${Date.now()}`
      }
    ];

    await LedgerService.executeDoubleEntry(disbursalEntries, `Loan Disbursed via ${transferMode} - Ref: ${referenceNumber}`);

    res.status(200).json({ success: true, message: "Loan disbursed and ledger updated.", data: loan });

  } catch (error) {
    console.error("Loan Disbursal Error:", error);
    res.status(500).json({ success: false, message: "Server error during loan disbursal." });
  }
};
