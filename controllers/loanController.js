const Loan = require("../models/Loan");
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User'); 
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

      const transactionsToLog = [
        {
          vendorNo: loan.memberId.vendorNo || "SYS-LOAN-AUTO",
          ledgerFolio: '152',
          memberId: loan.memberId,
          category: "LOAN_DISBURSEMENT",
          amount: grossAmount,
          entryType: "DEBIT",
          paymentMode: "INTERNAL_TRANSFER",
          transactionId: `TXN-${uuidv4()}`,
          description: "Gross Loan Amount Approved",
          status: "COMPLETED",
          relatedLoanId: loan._id,
          batchId: batchId
        },
        {
          vendorNo: loan.memberId.vendorNo || "SYS-LOAN-AUTO",
          ledgerFolio: '155',
          memberId: loan.memberId,
          category: "SHARE_CAPITAL",
          amount: finalShareDeduction,
          entryType: "CREDIT",
          paymentMode: "LOAN_DEDUCTION",
          transactionId: `TXN-${uuidv4()}`,
          description: "Deducted at Source for Shares",
          status: "COMPLETED",
          relatedLoanId: loan._id,
          batchId: batchId
        },
        {
          vendorNo: loan.memberId.vendorNo || "SYS-LOAN-AUTO",
          ledgerFolio: '151',
          memberId: loan.memberId,
          category: "BANK_PAYOUT",
          amount: netPayout,
          entryType: "CREDIT",
          paymentMode: "PAYOUT_GATEWAY",
          transactionId: `TXN-${uuidv4()}`,
          description: "Net Amount transferred to Bank",
          status: "PENDING", 
          relatedLoanId: loan._id,
          batchId: batchId
        }
      ];

      await TransactionLog.insertMany(transactionsToLog);
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

    // --- SEQUENTIAL LOAN NUMBERING LOGIC ---
    const existingLoansCount = await Loan.countDocuments({ memberId: memberId });
    const nextSequence = existingLoansCount + 1; 
    const loanId = `${user.vendorNo}-${nextSequence}`;
    // --------------------------------------------

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
    // Accepts paymentMode, audit fields, and the Cloudinary document URL from the frontend JSON payload
    const { vendorNo, emiAmount, annualInterestRate, isLatePayment, paymentMode, paymentDate, referenceNumber, documentProofUrl } = req.body;
    
    const LOAN_PRINCIPAL_FOLIO = '152'; 
    const LOAN_INTEREST_FOLIO = '153';  

    if (!vendorNo || !emiAmount || !annualInterestRate || !paymentMode) {
      return res.status(400).json({ success: false, message: "Missing required EMI fields including Payment Mode." });
    }

    // Cheques require banking clearance, so they go into a pending state.
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
      } else if (trx.entryType === 'CREDIT' && trx.category === 'LOAN_REPAYMENT') {
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

    const newTransactions = [];
    const batchId = `EMI-${uuidv4()}`;
    const targetMemberId = loanTransactions[0].memberId;

    // Base transaction layout including audit fields and Cloudinary URL
    const baseTx = {
      vendorNo: vendorNo,
      memberId: targetMemberId,
      status: txStatus,
      batchId: batchId,
      referenceNumber: referenceNumber || null,
      transactionDate: paymentDate ? new Date(paymentDate) : new Date(),
      documentProofUrl: documentProofUrl || null
    };

    newTransactions.push({
      ...baseTx,
      ledgerFolio: LOAN_INTEREST_FOLIO, 
      category: 'LOAN_EMI',
      amount: interestForMonth,
      entryType: 'CREDIT', 
      paymentMode: 'INTERNAL_TRANSFER',
      transactionId: `LOAN-INT-${uuidv4()}`,
      description: 'Monthly Loan Interest on Reducing Balance',
    });

    if (principalRepayment > 0) {
      newTransactions.push({
        ...baseTx,
        ledgerFolio: LOAN_PRINCIPAL_FOLIO, 
        category: 'LOAN_REPAYMENT',
        amount: principalRepayment,
        entryType: 'CREDIT', 
        paymentMode: paymentMode, 
        transactionId: `LOAN-PRN-${uuidv4()}`,
        description: isFinalSettlement ? 'Full & Final Principal Settlement' : `Monthly Principal Repayment (${paymentMode})`,
      });
    }

    if (isLatePayment && PENALTY_CONFIG.applyPenalty && !isFinalSettlement) {
      const penaltyAmount = PENALTY_CONFIG.type === 'FLAT' 
        ? PENALTY_CONFIG.flatAmount 
        : parseFloat((emiAmount * PENALTY_CONFIG.percentageRate).toFixed(2));

      newTransactions.push({
        ...baseTx,
        ledgerFolio: LOAN_PRINCIPAL_FOLIO, 
        category: 'PENALTY',
        amount: penaltyAmount,
        entryType: 'CREDIT', 
        paymentMode: paymentMode,
        transactionId: `PENALTY-${uuidv4()}`,
        description: 'Late EMI Payment Penalty',
      });
    }

    const savedTransactions = await TransactionLog.insertMany(newTransactions);
    const newOutstandingBalance = parseFloat((outstandingPrincipal - principalRepayment).toFixed(2));

    // --- AUTO-CLOSE LOAN (Only if funds are completely cleared) ---
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
        penaltyApplied: isLatePayment && PENALTY_CONFIG.applyPenalty && !isFinalSettlement ? true : false,
        transactions: savedTransactions.map(t => t.transactionId)
      }
    });

  } catch (error) {
    console.error("Error processing EMI:", error);
    res.status(500).json({ success: false, message: "Server error processing EMI" });
  }
};