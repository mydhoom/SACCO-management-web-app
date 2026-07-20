const Loan = require("../models/Loan");
const Transaction = require("../models/Transaction");
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
    const loans = await Loan.find().populate("memberId", "firstName lastName email");
    res.status(200).json(loans);
  } catch (error) {
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
          vendorNo: "SYS-LOAN-AUTO", 
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
          vendorNo: "SYS-LOAN-AUTO",
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
          vendorNo: "SYS-LOAN-AUTO",
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

      await Transaction.insertMany(transactionsToLog);
    }

    res.status(200).json({ message: "Loan status updated and ledger entries created!", loan });
  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ error: error.message });
  }
};