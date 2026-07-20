const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema({
  // 1. Added this field to handle custom human-readable IDs like "APP-1042"
  loanId: { 
    type: String, 
    required: true, 
    unique: true 
  },
  memberId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "Member", 
    required: true 
  },
  loanAmount: { 
    type: Number, 
    required: true 
  },
  interestRate: { 
    type: Number, 
    required: true 
  },
  startDate: { 
    type: Date, 
    default: Date.now 
  },
  endDate: { 
    type: Date, 
    required: true 
  },
  // 2. Changed to uppercase to perfectly match your frontend and controller logic
  status: { 
    type: String, 
    enum: ["PENDING", "APPROVED", "REJECTED", "REPAID"], 
    default: "PENDING" 
  },
});

module.exports = mongoose.model("Loan", loanSchema);