const mongoose = require('mongoose');

const transactionLogSchema = new mongoose.Schema({
  vendorNo: {
    type: String,
    required: true,
    index: true 
  },
  ledgerFolio: {
    type: String,
    default: null
  },
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member', // Updated to match your system
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      'SHARE_CAPITAL', 
      'MONTHLY_THRIFT', 
      'LOAN_DISBURSEMENT', 
      'LOAN_EMI', 
      'LOAN_REPAYMENT', 
      'WELFARE_FUND', 
      'PENALTY', 
      'BANK_PAYOUT',
      'RECURRING_DEPOSIT',
      'DIVIDEND_PAYOUT',
      'HONORARIUM',
      'ADMISSION_FEE',
      'STATIONARY_MISC',
      'AUDIT_FEE',
      'RESERVE_FUND',
      'EDUCATION_FUND'
    ]
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  entryType: {
    type: String,
    required: true,
    enum: ['CREDIT', 'DEBIT'] 
  },
  paymentMode: {
    type: String,
    enum: [
      'CASH', 
      'CHEQUE', 
      'BANK_TRANSFER', 
      'UPI', 
      'PAYMENT_GATEWAY', 
      'PAYOUT_GATEWAY', 
      'INTERNAL_TRANSFER', 
      'LOAN_DEDUCTION'
    ],
    default: 'CASH'
  },
  transactionId: {
    type: String,
    required: true,
    unique: true 
  },
  transactionDate: {
    type: Date,
    default: Date.now
  },
  description: {
    type: String,
    required: true 
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED'],
    default: 'COMPLETED'
  },
  relatedLoanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    default: null 
  },
  batchId: {
    type: String,
    default: null
  },
  transactionReference: {
    type: String,
    default: null
  },
  gatewayMetadata: {
    type: Object,
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('TransactionLog', transactionLogSchema);