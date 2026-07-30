const mongoose = require('mongoose');

const transactionLogSchema = new mongoose.Schema({
  vendorNo: {
    type: String,
    required: true,
    index: true 
  },
  memberName: {  // NEW: Added to support dashboard name rendering
    type: String,
    default: null
  },
  ledgerFolio: {
    type: String,
    default: null
  },
  memberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Member', 
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      // Original Categories
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
      'EDUCATION_FUND',
      // NEW: Double-Entry & Suspense Categories
      'BANK_RECEIPT',
      'INTEREST_INCOME',
      'LOAN_ASSET',
      'RD_LIABILITY',
      'RD_DEPOSIT',
      'RD_WITHDRAWAL',
      'SUSPENSE_CLEARING'
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
    enum: ['PENDING', 'PENDING_VERIFICATION', 'COMPLETED', 'FAILED'], // NEW: Added PENDING_VERIFICATION
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