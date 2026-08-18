// models/DemandBatch.js
// Tracks monthly payroll demand recovery batches from demand sheet to clearance.
const mongoose = require('mongoose');

const memberEntrySchema = new mongoose.Schema({
  memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vendorNo:         { type: String, required: true },
  memberName:       { type: String, required: true },
  activeLoanIds:    [String],
  rdAmount:         { type: Number, default: 0 },
  loanPrincipalDue: { type: Number, default: 0 },
  loanInterestDue:  { type: Number, default: 0 },
  loanTotalDue:     { type: Number, default: 0 },
  totalDeduction:   { type: Number, default: 0 },
  status:           { type: String, enum: ['PENDING', 'CLEARED', 'EXCLUDED'], default: 'PENDING' },
  clearedAt:        { type: Date, default: null },
  clearedTransactionIds: [String],
  remarks:          { type: String, default: '' }
}, { _id: false });

const demandBatchSchema = new mongoose.Schema({
  batchId: { type: String, required: true, unique: true, index: true },
  purpose:       { type: String, default: 'Monthly Payroll Demand Recovery' },
  month:         { type: String, required: true },
  year:          { type: Number, required: true },
  financialYear: { type: String, required: true },
  status: {
    type: String,
    enum: ['PENDING', 'PARTIALLY_CLEARED', 'COMPLETED', 'CANCELLED'],
    default: 'PENDING'
  },
  totalMembers:       { type: Number, default: 0 },
  totalRDAmount:      { type: Number, default: 0 },
  totalLoanPrincipal: { type: Number, default: 0 },
  totalLoanInterest:  { type: Number, default: 0 },
  totalLoanAmount:    { type: Number, default: 0 },
  grandTotalAmount:   { type: Number, default: 0 },
  clearedRDAmount:      { type: Number, default: 0 },
  clearedLoanAmount:    { type: Number, default: 0 },
  clearedTotalAmount:   { type: Number, default: 0 },
  unclearedTotalAmount: { type: Number, default: 0 },
  clearedCount:         { type: Number, default: 0 },
  unclearedCount:       { type: Number, default: 0 },
  members: [memberEntrySchema],
  memoTransactionId: { type: String, default: null }
}, { timestamps: true });

demandBatchSchema.index({ month: 1, year: 1 });

module.exports = mongoose.model('DemandBatch', demandBatchSchema);
