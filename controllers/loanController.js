const Loan = require("../models/Loan");
const TransactionLog = require('../models/TransactionLog');
const { v4: uuidv4 } = require("uuid");

exports.requestLoan = async (req, res) => {
  try {
    const { memberId, loanAmount, interestRate, endDate } = req.body;

    const loan = new Loan({ memberId, loanAmount, interestRate, endDate });
    await loan.save();

    res.status(201).json({ message: "Loan request submitted successfully!", loan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getLoans = async (req, res) => {
  try {
    // We added "name" and "vendorNo" to the list of fields to pull from the User database
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
    // We also pull the dynamic share deduction from the req.body here
    const { status, shareDeductionAmount } = req.body; 

    // Search by your custom human-readable ID
    let loan = await Loan.findOne({ loanId: id });

    // --- 🚀 TEMPORARY TEST SEEDER: Auto-create APP-1042 if missing ---
    if (!loan && id === 'APP-1042') {
      console.log("Test loan missing. Auto-creating APP-1042 in database...");
      const mongoose = require('mongoose');
      
      // Find ANY existing user in your DB to attach this test loan to
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
    // -----------------------------------------------------------------

    if (!loan) {
      return res.status(404).json({ error: "Loan not found in database!" });
    }

    const isNewlyApproved = status === "APPROVED" && loan.status !== "APPROVED";
    
    loan.status = status;
    await loan.save();

    if (isNewlyApproved) {
      const batchId = `BATCH-${uuidv4()}`;
      const grossAmount = loan.loanAmount;
      
      // Use the exact deduction typed in the modal, or default to 10%
      const finalShareDeduction = shareDeductionAmount || (grossAmount * 0.10); 
      const netPayout = grossAmount - finalShareDeduction;

      const transactionsToLog = [
        {
          vendorNo: loan.memberId.vendorNo || "SYS-LOAN-AUTO", // Fallback if populate fails
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
    // 1. Catch the data sent from the React form
    const { requestedAmount, tenure, purpose, sharePaymentMethod } = req.body;

    // 2. Identify the member applying (NO MORE FAKE FALLBACKS)
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User token is missing." });
    }
    
    // THIS LOG WILL SHOW EXACTLY WHAT YOUR TOKEN HOLDS IN THE TERMINAL
    console.log("Decoded User Token:", req.user);

    // 3. The Catch-All: Check for id, _id, or userId
    const memberId = req.user.id || req.user._id || req.user.userId; 

    if (!memberId) {
      return res.status(400).json({ error: "Could not extract valid member ID from token." });
    }

    // 4. Generate a dynamic official Application ID
    const randomAppNum = Math.floor(1000 + Math.random() * 9000);
    const loanId = `APP-${randomAppNum}`;

    // 5. Calculate the official End Date
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + Number(tenure));

    // 6. Build and save the application
    const newApplication = new Loan({
      loanId: loanId,
      memberId: memberId, // Securely locked!
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

// ==========================================
// NEW CONTROLLER: Process Monthly EMI
// ==========================================

// Flexible Penalty Configuration (Can be moved to a database config later)
const PENALTY_CONFIG = {
  applyPenalty: true,       // Toggle to true/false
  type: 'FLAT',             // 'FLAT' or 'PERCENTAGE'
  flatAmount: 200,          // Flat penalty amount (e.g., ₹200)
  percentageRate: 0.02      // 2% of the EMI amount
};

exports.processEMI = async (req, res) => {
  try {
    const { vendorNo, emiAmount, annualInterestRate, isLatePayment } = req.body;
    const loanFolioNo = '152'; // Standard folio for Loans

    if (!vendorNo || !emiAmount || !annualInterestRate) {
      return res.status(400).json({ success: false, message: "Missing required EMI fields." });
    }

    // 1. Calculate Outstanding Principal dynamically from the Master Journal
    const loanTransactions = await TransactionLog.find({ 
      vendorNo: vendorNo, 
      ledgerFolio: loanFolioNo,
      status: 'COMPLETED' 
    });

    let outstandingPrincipal = 0;
    loanTransactions.forEach(trx => {
      if (trx.entryType === 'DEBIT') {
        outstandingPrincipal += trx.amount; // Loan disbursement adds to balance
      } else if (trx.entryType === 'CREDIT' && trx.category === 'LOAN_REPAYMENT') {
        outstandingPrincipal -= trx.amount; // Principal repayment reduces balance
      }
    });

    if (outstandingPrincipal <= 0) {
      return res.status(400).json({ success: false, message: "No active loan balance found for this member." });
    }

    // 2. Calculate the Reducing Balance Interest for the current month
    const monthlyRate = (annualInterestRate / 100) / 12;
    const interestForMonth = parseFloat((outstandingPrincipal * monthlyRate).toFixed(2));

    // Calculate how much of the EMI goes to Principal vs Interest
    const principalRepayment = parseFloat((emiAmount - interestForMonth).toFixed(2));

    if (principalRepayment <= 0) {
       return res.status(400).json({ success: false, message: "EMI amount must be strictly greater than the monthly interest due." });
    }

    const newTransactions = [];
    const batchId = `EMI-${uuidv4()}`;

    // 3. Log the Interest Deduction
    newTransactions.push({
      vendorNo: vendorNo,
      ledgerFolio: loanFolioNo,
      memberId: loanTransactions[0].memberId, // Borrowing memberId from previous logs
      category: 'LOAN_EMI',
      amount: interestForMonth,
      entryType: 'CREDIT', // Crediting the society's interest income
      paymentMode: 'INTERNAL_TRANSFER',
      transactionId: `LOAN-INT-${uuidv4()}`,
      description: 'Monthly Loan Interest on Reducing Balance',
      status: 'COMPLETED',
      batchId: batchId
    });

    // 4. Log the Principal Repayment
    newTransactions.push({
      vendorNo: vendorNo,
      ledgerFolio: loanFolioNo,
      memberId: loanTransactions[0].memberId,
      category: 'LOAN_REPAYMENT',
      amount: principalRepayment,
      entryType: 'CREDIT', // Crediting the loan account (reduces outstanding)
      paymentMode: 'CASH', // Could also accept this dynamically from req.body
      transactionId: `LOAN-PRN-${uuidv4()}`,
      description: 'Monthly Loan Principal Repayment',
      status: 'COMPLETED',
      batchId: batchId
    });

    // 5. Apply Flexible Penalty if Payment is Late
    if (isLatePayment && PENALTY_CONFIG.applyPenalty) {
      const penaltyAmount = PENALTY_CONFIG.type === 'FLAT' 
        ? PENALTY_CONFIG.flatAmount 
        : parseFloat((emiAmount * PENALTY_CONFIG.percentageRate).toFixed(2));

      newTransactions.push({
        vendorNo: vendorNo,
        ledgerFolio: loanFolioNo,
        memberId: loanTransactions[0].memberId,
        category: 'PENALTY',
        amount: penaltyAmount,
        entryType: 'CREDIT', 
        paymentMode: 'CASH',
        transactionId: `PENALTY-${uuidv4()}`,
        description: 'Late EMI Payment Penalty',
        status: 'COMPLETED',
        batchId: batchId
      });
    }

    // 6. Save all transactions to the Master Journal
    const savedTransactions = await TransactionLog.insertMany(newTransactions);

    res.status(200).json({
      success: true,
      message: 'EMI Processed successfully.',
      data: {
        totalEmiPaid: emiAmount,
        interestDeducted: interestForMonth,
        principalReduced: principalRepayment,
        newOutstandingBalance: parseFloat((outstandingPrincipal - principalRepayment).toFixed(2)),
        penaltyApplied: isLatePayment && PENALTY_CONFIG.applyPenalty ? true : false,
        transactions: savedTransactions.map(t => t.transactionId)
      }
    });

  } catch (error) {
    console.error("Error processing EMI:", error);
    res.status(500).json({ success: false, message: "Server error processing EMI" });
  }
};