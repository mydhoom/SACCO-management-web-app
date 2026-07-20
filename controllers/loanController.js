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
    const { status } = req.body;

    // CHANGE IT TO THIS:
// Replace 'loanId' with whatever field name you use in your database for the account number
const loan = await Loan.findOne({ loanId: id });

    if (!loan) {
      return res.status(404).json({ error: "Loan not found!" });
    }

    // Check if the loan is being approved RIGHT NOW to prevent duplicate ledger entries
    const isNewlyApproved = status === "APPROVED" && loan.status !== "APPROVED";
    
    // Update and save the new status
    loan.status = status;
    await loan.save();

    // If newly approved, generate the Compound Journal Entry (Net Disbursement)
    if (isNewlyApproved) {
      const batchId = `BATCH-${uuidv4()}`;
      const grossAmount = loan.loanAmount;
      
      // Calculate Share Deduction (Example: 10% of gross loan). 
      // You can adjust this math or pull it from req.body if the admin inputs it manually.
      const shareDeductionAmount = req.body.shareDeductionAmount || (grossAmount * 0.10); 
      const netPayout = grossAmount - shareDeductionAmount;

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
          amount: shareDeductionAmount,
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

      // Save all three entries simultaneously
      await Transaction.insertMany(transactionsToLog);
    }

    res.status(200).json({ message: "Loan status updated successfully!", loan });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};