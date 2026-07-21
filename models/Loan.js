const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema({
  loanId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  memberId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  loanAmount: { 
    type: Number, 
    required: true 
  },
  interestRate: { 
    type: Number, 
    required: true,
    default: 10 // Assuming a standard 10% interest rate
  },
  // --- New Application Fields ---
  tenure: { 
    type: Number, 
    required: true 
  },
    sharePaymentMethod: { 
    type: String, 
    enum: ['DEDUCT_FROM_LOAN', 'UPFRONT_PAYMENT'], 
    required: true,
    default: 'DEDUCT_FROM_LOAN'
  },
  // ------------------------------
  startDate: { 
    type: Date, 
    default: Date.now 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["PENDING", "APPROVED", "REJECTED", "REPAID"], 
    default: "PENDING" 
  },
});

module.exports = mongoose.model("Loan", loanSchema);