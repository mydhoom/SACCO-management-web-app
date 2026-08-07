const mongoose = require('mongoose');

const transactionLogSchema = new mongoose.Schema({
  documentProofUrl: {
    type: String,
    default: null
  },
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
  memberUpiId: {
    type: String,
    default: null
  },
  gatewayMetadata: {
    type: Object,
    default: null
  }
}, { timestamps: true });
// ==========================================
// CUSTOM TRANSACTION ID GENERATOR
// ==========================================
transactionLogSchema.pre('save', function (next) {
  // Only generate a new ID if this is a brand new transaction being created
  if (this.isNew) {
    // 1. Determine the Prefix based on the Category
    let typePrefix = 'GEN'; // General fallback
    const cat = this.category || '';
    
    if (cat.includes('LOAN')) typePrefix = 'LN';
    else if (cat.includes('RECURRING')) typePrefix = 'RD';
    else if (cat.includes('THRIFT')) typePrefix = 'MT';
    else if (cat.includes('SHARE')) typePrefix = 'SH';
    else if (cat.includes('DIVIDEND')) typePrefix = 'DIV';
    else if (cat.includes('FEE') || cat.includes('FUND')) typePrefix = 'FEE';

    // 2. Get the Vendor Number (Fallback to 'SYS' if it's a system transfer)
    const vendor = this.vendorNo ? this.vendorNo.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : 'SYS';

    // 3. Format the Date as YYYYMMDD
    const dateObj = this.transactionDate || new Date();
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    // 4. Generate a short 4-character random string to guarantee uniqueness
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();

    // 5. Combine them together into the final readable ID
    this.transactionId = `${typePrefix}-${vendor}-${dateStr}-${randomSuffix}`;
  }
  
  next();
});

module.exports = mongoose.model('TransactionLog', transactionLogSchema);