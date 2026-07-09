const mongoose = require("mongoose");

const transactionLogSchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: "Member", required: true },
  transactionType: { type: String, enum: ["savings", "loan"], required: true },
  amount: { type: Number, required: true },
  date: { type: Date, default: Date.now },
  details: { type: Object },
});

module.exports = mongoose.model("TransactionLog", transactionLogSchema);
