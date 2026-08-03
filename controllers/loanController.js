const Loan = require("../models/Loan");
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User'); 
const LedgerService = require('../services/LedgerService'); // NEW: Import the Enforcer
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
    const { status, shareDeductionAmount } = req.body; 

    let loan = await Loan.findOne({ loanId: id });

    // --- TEMPORARY TEST SEEDER ---
    if (!loan && id === 'APP-1042') {
      console.log("Test loan missing. Auto-creating APP-1042 in database...");
      const mongoose = require('mongoose');
      
      const testUser = await mongoose.model('User').findOne(); 
      if (!testUser) {
        return res.status(400).json({ error: "You need at least one registered user in your database to run this test!" });
      }
      
      loan = new Loan({
        loanId: 'APP-1042',
        memberId: testUser._id,
        loanAmount: 50000,
        interestRate: 10,
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
        status: 'PENDING'
      });
      await loan.save();
    }
    // -----------------------------

    if (!loan) {
      return res.status(404).json({ error: "Loan not found in database!" });
    }

    const isNewlyApproved = status === "APPROVED" && loan.status !== "APPROVED";
    
    loan.status = status;
    await loan.save();

    if (isNewlyApproved) {
      const batchId = `BATCH-${uuidv4()}`;
      const grossAmount = loan.loanAmount;
      
      const finalShareDeduction = shareDeductionAmount || (grossAmount * 0.10); 
      const netPayout = grossAmount - finalShareDeduction;

      const fetchedUser = await User.findById(loan.memberId);
      const exactVendorNo = fetchedUser && fetchedUser.vendorNo ? fetchedUser.vendorNo : "SYS-LOAN-AUTO";
      const exactMemberName = fetchedUser ? (fetchedUser.name || `${fetchedUser.firstName || ''} ${fetchedUser.lastName || ''}`.trim() || 'Unknown Member') : "System Auto";

      // Array prepared for the LedgerService
      const transactionsToLog = [
        {
          vendorNo: exactVendorNo,
          memberName: exactMemberName, 
          ledgerFolio: '152', // LedgerService uses 'folio' instead of 'ledgerFolio'
          memberId: loan.memberId,
          category: "LOAN_DISBURSEMENT",
          amount: grossAmount,
          entryType: "DEBIT",
          paymentMode: "INTERNAL_TRANSFER",
          transactionId: `TXN-${uuidv4()}`,
          status: "COMPLETED",
          relatedLoanId: loan._id,
          batchId: batchId
        },
        {
          vendorNo: exactVendorNo,
          memberName: exactMemberName, 
          ledgerFolio: '155',
          memberId: loan.memberId,
          category: "SHARE_CAPITAL",
          amount: finalShareDeduction,
          entryType: "CREDIT",
          paymentMode: "LOAN_DEDUCTION",
          transactionId: `TXN-${uuidv4()}`,
          status: "COMPLETED",
          relatedLoanId: loan._id,
          batchId: batchId
        },
        {
          vendorNo: exactVendorNo,
          memberName: exactMemberName, 
          ledgerFolio: '151', 
          memberId: loan.memberId,
          category: "BANK_PAYOUT",
          amount: netPayout,
          entryType: "CREDIT",
          paymentMode: "PAYOUT_GATEWAY",
          transactionId: `TXN-${uuidv4()}`,
          status: "PENDING", // LedgerService must be updated to respect this
          relatedLoanId: loan._id,
          batchId: batchId
        }
      ];

      // NEW: Pass through the Double-Entry Enforcer
      await LedgerService.executeDoubleEntry(transactionsToLog, "Loan Disbursement Approved");
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
    const BANK_RECEIPT_FOLIO = '101'; // NEW: Required for the Debit side

    if (!vendorNo || !emiAmount || !annualInterestRate || !paymentMode) {
      return res.status(400).json({ success: false, message: "Missing required EMI fields including Payment Mode." });
    }

    const txStatus = paymentMode === 'CHEQUE' ? 'PENDING_VERIFICATION' : 'COMPLETED';

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

    // NEW: Calculate penalty first so we can add it to the Bank Debit
    let penaltyAmount = 0;
    if (isLatePayment && PENALTY_CONFIG.applyPenalty && !isFinalSettlement) {
      penaltyAmount = PENALTY_CONFIG.type === 'FLAT' 
        ? PENALTY_CONFIG.flatAmount 
        : parseFloat((emiAmount * PENALTY_CONFIG.percentageRate).toFixed(2));
    }

    // The total money actually hitting the bank
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

    // --- NEW: THE MISSING DEBIT ENTRY ---
    newTransactions.push({
      ...baseTx,
      ledgerFolio: BANK_RECEIPT_FOLIO,
      category: 'BANK_RECEIPT',
      amount: totalDebitAmount,
      entryType: 'DEBIT',
      paymentMode: paymentMode,
      transactionId: `BANK-IN-${uuidv4()}`
    });

    // --- THE CREDIT ENTRIES ---
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

    // NEW: Pass through the Double-Entry Enforcer
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

// ==========================================
// NEW DASHBOARD CONTROLLERS 
// ==========================================

exports.getPendingTransactions = async (req, res) => {
  try {
    const pendingTxns = await TransactionLog.find({ status: 'PENDING_VERIFICATION', entryType: 'CREDIT', category: 'LOAN_REPAYMENT' })
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

// Fetch the logged-in user's active, approved, or pending loan
exports.getMyLoan = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    
    // UPDATED: Now fetches PENDING, APPROVED, and ACTIVE loans.
    // .sort({ createdAt: -1 }) ensures it grabs their newest application
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

// ==========================================
// NEW: SETTLE LOAN VIA RD OR SHARE BALANCE
// ==========================================
exports.settleLoanWithSavings = async (req, res) => {
  try {
    const { loanId, vendorNo, settlementSource, amountToAdjust } = req.body; 
    // settlementSource can be 'RD_BALANCE' or 'SHARE_CAPITAL'

    if (!loanId || !vendorNo || !settlementSource || !amountToAdjust || Number(amountToAdjust) <= 0) {
      return res.status(400).json({ success: false, message: "Invalid payload parameters provided." });
    }

    const numericAmount = Number(amountToAdjust);

    // 1. Fetch User and Loan records
    const user = await User.findOne({ vendorNo });
    const loan = await Loan.findOne({ loanId, vendorNo });

    if (!user || !loan) {
      return res.status(404).json({ success: false, message: "User or Loan record not found." });
    }

    if (loan.status === 'CLOSED') {
      return res.status(400).json({ success: false, message: "This loan is already closed." });
    }

    // 2. Validate available balance based on source
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

    // 3. Calculate exact outstanding principal from TransactionLog (Folio 152)
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
    const savingsFolio = settlementSource === 'SHARE_CAPITAL' ? '155' : '154'; // 155 = Share Capital, 154 = RD
    const memberName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown Member';

    // 4. Prepare Double-Entry Transactions
    // DEBIT: Reducing Member Savings/Shares liability (Liability account goes down via Debit)
    // CREDIT: Reducing Loan Principal asset (Asset account goes down via Credit)
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
        ledgerFolio: '152', // Loan Principal Folio
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

    // Execute via Ledger Enforcer
    await LedgerService.executeDoubleEntry(contraTransactions, `Loan ${loanId} settled using ${settlementSource.replace('_', ' ')}`);

    // 5. Update User Balance
    if (settlementSource === 'RD_BALANCE') {
      user.rdBalance -= numericAmount;
    } else {
      user.currentShareMoneyTotal -= numericAmount;
    }
    await user.save();

    // 6. Check if fully closed
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

    // Calculate exact outstanding principal from TransactionLog (Folio 152)
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
// ==========================================
// GENERATE MONTHLY DEMAND / RECOVERY LIST
// ==========================================
exports.generateDemandSheet = async (req, res) => {
  try {
    // 1. Fetch all members from the database
    // (Make sure 'User' and 'Loan' are imported at the top of your file!)
    const users = await User.find({}); 
    const demandList = [];

    for (const user of users) {
      // Pull their fixed RD amount (Ensure this matches the field in your User schema)
      const rdMonthly = user.monthlyRdContribution || user.rdAmount || 0; 

      // 2. Find active loans for the member
      const activeLoans = await Loan.find({ 
        vendorNo: user.vendorNo, 
        status: { $in: ['APPROVED', 'ACTIVE'] } 
      });

      let loanDemand = 0;
      const activeLoanIds = [];

      for (const loan of activeLoans) {
        // Grab the standard EMI saved on the loan
        const emi = loan.emiAmount || loan.monthlyEMI || 0;
        
        loanDemand += emi;
        activeLoanIds.push(loan.loanId);
      }

      // 3. Only add member to the list if they actually owe something this month
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

    // Send the calculated list back to DemandSheet.jsx
    res.status(200).json({ success: true, data: demandList });

  } catch (error) {
    console.error("Demand Sheet Error:", error);
    res.status(500).json({ success: false, message: "Server error generating demand sheet." });
  }
};
// Fetch the logged-in user's active loan
const getMyLoan = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // Assuming your Loan schema links to the user via 'memberId'
    const loan = await Loan.findOne({ memberId: userId, status: 'ACTIVE' });
    
    res.status(200).json({ loan });
  } catch (error) {
    console.error("Get My Loan Error:", error);
    res.status(500).json({ error: "Failed to fetch loan data." });
  }
};
// Fetch the logged-in user's active loan
// Changed from "const" to "exports." so it matches the rest of the file!
exports.getMyLoan = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    // Assuming your Loan schema links to the user via 'memberId'
    const loan = await Loan.findOne({ memberId: userId, status: 'ACTIVE' });
    
    res.status(200).json({ loan });
  } catch (error) {
    console.error("Get My Loan Error:", error);
    res.status(500).json({ error: "Failed to fetch loan data." });
  }
};