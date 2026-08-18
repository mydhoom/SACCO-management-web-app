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
      // Double-Entry & Suspense Categories
      'BANK_RECEIPT',
      'INTEREST_INCOME',
      'LOAN_ASSET',
      'RD_LIABILITY',
      'RD_DEPOSIT',
      'RD_WITHDRAWAL',
      'SUSPENSE_CLEARING',
      // Payroll Demand Batch Categories
      'LOAN_REPAYMENT_PAYROLL',
      'INTEREST_INCOME_PAYROLL',
      'RD_DEPOSIT_PAYROLL',
      // BRS Reconciliation Memo (does NOT affect financial balances)
      'PAYROLL_BATCH_MEMO',
      // Correction Manager
      'REVERSAL'
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
    enum: ['PENDING', 'PENDING_VERIFICATION', 'COMPLETED', 'FAILED', 'REVERSED'],
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
  },

  // ── Correction Manager fields ──
  // On the original transaction: points to the counter-entry that reversed it
  reversedById: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionLog',
    default: null
  },
  // On the counter-entry: points back to the original transaction being reversed
  reversalOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TransactionLog',
    default: null
  },
  // Reason stored on both original and counter-entry
  reversalReason: {
    type: String,
    default: null
  },

  // ── BRS Memo flag ──
  // If true, this entry is a reconciliation-only memo entry.
  // It MUST NOT affect financial balances or appear in Trial Balance / Financial Statements.
  // It exists solely so the BRS engine can match lump-sum employer payroll deposits.
  isMemoEntry: {
    type: Boolean,
    default: false
  },

  // For payroll batch entries: stores the demand batch ID
  demandBatchId: {
    type: String,
    default: null
  }

}, { timestamps: true });
// ==========================================
// CUSTOM TRANSACTION ID GENERATOR
// ==========================================
transactionLogSchema.pre('validate', function (next) {
  // 0. ENFORCE STRICT FOLIO MAPPING FOR AUDIT INTEGRITY
  if (!this.ledgerFolio && this.category) {
    const FOLIO_MAP = {
      'BANK_RECEIPT': '101', 'BANK_PAYOUT': '101',
      'PAYROLL_BATCH_MEMO': '101', // BRS memo entry — same folio, excluded from balances via isMemoEntry flag
      'LOAN_ASSET': '152', 'LOAN_DISBURSEMENT': '152', 'LOAN_REPAYMENT': '152', 'LOAN_EMI': '152',
      'LOAN_REPAYMENT_PAYROLL': '152',
      'INTEREST_INCOME': '153',
      'INTEREST_INCOME_PAYROLL': '153',
      'RECURRING_DEPOSIT': '154', 'RD_LIABILITY': '154', 'RD_DEPOSIT': '154', 'RD_WITHDRAWAL': '154',
      'RD_DEPOSIT_PAYROLL': '154',
      'SHARE_CAPITAL': '155',
      'MONTHLY_THRIFT': '156', 
      'HONORARIUM': '157', 'ADMISSION_FEE': '157', 'STATIONARY_MISC': '157', 'AUDIT_FEE': '157', 'PENALTY': '157',
      'DIVIDEND_PAYOUT': '158',
      'RESERVE_FUND': '159', 'EDUCATION_FUND': '159',
      'WELFARE_FUND': '160',
      'SUSPENSE_CLEARING': '999'
    };
    if (FOLIO_MAP[this.category]) {
      this.ledgerFolio = FOLIO_MAP[this.category];
    } else if (this.category !== 'REVERSAL') {
      // Fallback
      this.ledgerFolio = '999';
    }
  }

  // Generate readable transactionId if new or if legacy format (e.g. TRX-...)
  if (this.isNew || !this.transactionId || this.transactionId.startsWith('TRX-')) {
    // 1. Vendor / System Prefix
    let vendorPrefix = 'SYS';
    const rawVendor = (this.vendorNo || '').trim().toUpperCase();

    if (rawVendor && !rawVendor.startsWith('SYS') && rawVendor !== 'SYSTEM_ENTRY' && rawVendor !== 'SYSTEM') {
      vendorPrefix = rawVendor.replace(/[^A-Z0-9]/g, '');
    } else if (this.category === 'BANK_RECEIPT' || this.category === 'BANK_PAYOUT' || this.ledgerFolio === '101') {
      vendorPrefix = 'SYS-BANK';
    } else if (this.category === 'INTEREST_INCOME' || this.ledgerFolio === '153') {
      vendorPrefix = 'SYS-INT';
    } else if (this.category === 'REVERSAL') {
      vendorPrefix = 'SYS-REV';
    } else {
      vendorPrefix = 'SYS';
    }

    // 2. Category / Module Prefix
    let catCode = 'GEN';
    const cat = (this.category || '').toUpperCase();

    if (cat.includes('LOAN')) catCode = 'LN';
    else if (cat.includes('RECURRING') || cat.includes('RD')) catCode = 'RD';
    else if (cat.includes('THRIFT')) catCode = 'MT';
    else if (cat.includes('SHARE')) catCode = 'SH';
    else if (cat.includes('INTEREST')) catCode = 'INT';
    else if (cat.includes('DIVIDEND')) catCode = 'DIV';
    else if (cat.includes('BANK')) catCode = 'BANK';
    else if (cat.includes('PENALTY') || cat.includes('FEE') || cat.includes('FUND')) catCode = 'FEE';
    else if (cat === 'REVERSAL') catCode = 'REV';

    // 3. Date in DDMMYYYY format
    const dateObj = this.transactionDate || this.createdAt || new Date();
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    const dateStr = `${dd}${mm}${yyyy}`;

    // 4. Entry Type (CR / DR)
    const typeCode = this.entryType === 'DEBIT' ? 'DR' : 'CR';

    // 5. Short 2-character hex salt to guarantee database uniqueness
    const salt = Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0');

    // Format: 12345-LN-12082026-CR-A1 or SYS-BANK-12082026-DR-F9
    this.transactionId = `${vendorPrefix}-${catCode}-${dateStr}-${typeCode}-${salt}`;
  }
  
  next();
});

module.exports = mongoose.model('TransactionLog', transactionLogSchema);