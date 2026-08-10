const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Kept your security import!

const userSchema = new mongoose.Schema({
  // --- 1. Core Identity & Authentication ---
  vendorNo: { type: String, required: true, unique: true },
  societyAccountNo: { type: String, default: "" }, // NEW: Added from user image
  name: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "member"], default: "member" },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  
  // --- 2. Professional & Departmental Details ---
  designation: { type: String, default: "" },
  jobDescription: { type: String, default: "" }, // e.g., Field / Technical, Official
  circle: { type: String, default: "" },
  division: { type: String, default: "" },
  subDivision: { type: String, default: "" },
  electricalSection: { type: String, default: "" },

  // --- 3. Personal & Contact Info ---
  phoneNumber: { type: String, default: "" },
  emailId: { type: String, default: "" },
  permanentAddress: { type: String, default: "" },
  upiId: { type: String, default: "" }, // Added UPI ID for loan & withdrawal disbursals

  // --- 4. Dates & Timelines ---
  dateOfBirth: { type: Date, default: null }, // <-- ADDED: Date of Birth
  dateOfJoining: { type: Date, default: null },
  dateOfRetirement: { type: Date, default: null },

  // --- 5. Financial Details ---
  currentShareMoneyTotal: { type: Number, default: 0 },
  dividends: { type: Number, default: 0 },
  rdBalance: { type: Number, default: 0 },
  monthlyRDAmount: { type: Number, default: 0 },
  
  // --- 6. Loan & EMI Tracking ---
  activeLoanAmount: { type: Number, default: 0 },
  pendingLoanBalance: { type: Number, default: 0 },
  pendingLoanInterest: { type: Number, default: 0 }, // NEW: Added Opening Interest Pending
  monthlyEmiAmount: { type: Number, default: 0 },
  remainingEmis: { type: Number, default: 0 },
  emiStartDate: { type: Date, default: null },
  emiEndDate: { type: Date, default: null },
  nextEmiDueDate: { type: Date, default: null }, // NEW: Added for Defaulter Tracking
  defaulterStatus: { type: Boolean, default: false }, // NEW: Added for Defaulter Tracking

  // --- 7. Withdrawal History ---
  withdrawalAmount: { type: Number, default: 0 },
  withdrawalDate: { type: Date, default: null },

  // --- 8. KYC & Identity (SACCO requirement) ---
  aadharNumber: { type: String, default: "" },
  panNumber: { type: String, default: "" },

  // --- 9. Banking Details (For Disbursals/Payouts) ---
  bankName: { type: String, default: "" },
  bankAccountNumber: { type: String, default: "" },
  ifscCode: { type: String, default: "" },

  // --- 10. Nominee / Next of Kin ---
  nomineeName: { type: String, default: "" },
  nomineeRelationship: { type: String, default: "" },
  nomineePhone: { type: String, default: "" }

}, { 
  timestamps: true // Automatically tracks exactly when a profile is created or updated
});

// --- CRITICAL SECURITY HOOKS ---

// Securely hash the password before saving it to the database
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare the typed password with the securely saved one
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);