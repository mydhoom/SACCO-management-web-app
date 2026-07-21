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
exports.applyForLoan = async (req, res) => {
  try {
    // 1. Catch the data sent from the React form
    const { requestedAmount, tenure, purpose, sharePaymentMethod } = req.body;

    // 2. Identify the member applying (NO MORE FAKE FALLBACKS!)
    // If the token is missing, the server will intentionally block the request.
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User token is missing." });
    }
    
    // Check for BOTH _id (MongoDB standard) and id (JWT standard) to be absolutely safe
    const memberId = req.user._id || req.user.id; 

    // 3. Generate a dynamic official Application ID (e.g., APP-8492)
    const randomAppNum = Math.floor(1000 + Math.random() * 9000);
    const loanId = `APP-${randomAppNum}`;

    // 4. Calculate the official End Date (Current date + tenure months)
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + Number(tenure));

    // 5. Build and save the application
    const newApplication = new Loan({
      loanId: loanId,
      memberId: memberId, // Now securely locked to the real logged-in user!
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