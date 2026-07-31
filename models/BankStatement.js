const mongoose = require('mongoose');

const bankStatementSchema = new mongoose.Schema({
  financialYear: { type: String, required: true }, // e.g., '2023-2024'
  month: { type: String, required: true }, // e.g., 'April'
  
  // Metadata
  bankName: { type: String, default: 'Unknown Bank' },
  accountNumber: { type: String, default: 'Unknown Account' },
  statementPeriod: { type: String, default: 'Unknown Period' },
  
  // BRS Summary Totals
  closingBankBalance: { type: Number, default: 0 },
  totalUnidentifiedDeposits: { type: Number, default: 0 },
  totalDirectBankDebits: { type: Number, default: 0 },
  
  // The BRS Audit Payload (Embedded Document)
  brsSummary: {
    systemCashBookBalance: { type: Number, default: 0 },
    totalUnclearedPayments: { type: Number, default: 0 },
    totalUnclearedReceipts: { type: Number, default: 0 },
    unclearedReceiptsDetails: Array, // Cheques Deposited but not cleared
    unclearedPaymentsDetails: Array  // Cheques Issued but not presented
  },

  // Raw Parsed Data Arrays
  matchedTransactions: Array,
  suspenseEntries: Array,
  
  // Workflow States
  isApproved: { type: Boolean, default: false },
  preparedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// Ensure we only have one statement per month, per financial year
bankStatementSchema.index({ financialYear: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('BankStatement', bankStatementSchema);