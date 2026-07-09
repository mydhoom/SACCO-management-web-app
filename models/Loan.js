const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  loanAmount: { type: Number, required: true },
  interestRate: { type: Number, required: true },
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "repaid"], default: "pending" },
});

module.exports = mongoose.model("Loan", loanSchema);
