const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  // --- 1. Core Identity & Authentication ---
  vendorNo: { type: String, required: true, unique: true },
  societyAccountNo: { type: String, default: "" },
  name: { type: String, required: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "executive", "member"], default: "member" },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'APPROVED'], default: 'pending' },

  // --- 2. Professional & Departmental Details ---
  designation: { type: String, default: "" },
  jobDescription: { type: String, default: "" },
  circle: { type: String, default: "" },
  division: { type: String, default: "" },
  subDivision: { type: String, default: "" },
  electricalSection: { type: String, default: "" },
  officeLocation: { type: String, default: "" },

  // --- 3. Personal & Contact Info ---
  // Primary names used by UserProfile.jsx (frontend-canonical)
  phone: { type: String, default: "" },           // replaces phoneNumber
  email: { type: String, default: "" },           // replaces emailId
  alternatePhone: { type: String, default: "" },
  address: { type: String, default: "" },         // residential address
  permanentAddress: { type: String, default: "" },
  upiId: { type: String, default: "" },
  // Legacy aliases (kept for backward compatibility with old data)
  phoneNumber: { type: String, default: "" },
  emailId: { type: String, default: "" },

  // --- 4. Personal Details ---
  fatherName: { type: String, default: "" },
  gender: { type: String, default: "" },
  bloodGroup: { type: String, default: "" },

  // --- 5. Dates & Timelines ---
  dob: { type: Date, default: null },             // Date of Birth (UserProfile.jsx key)
  dateOfBirth: { type: Date, default: null },     // legacy alias
  retirementAge: { type: Number, enum: [58, 60], default: 58 }, // Service tenure age (58 or 60 Years)
  joiningDate: { type: Date, default: null },
  dateOfJoining: { type: Date, default: null },   // legacy alias
  retirementDate: { type: Date, default: null },
  dateOfRetirement: { type: Date, default: null }, // legacy alias

  // --- 6. Financial Details ---
  currentShareMoneyTotal: { type: Number, default: 0 },
  dividends: { type: Number, default: 0 },
  rdBalance: { type: Number, default: 0 },
  monthlyRDAmount: { type: Number, default: 0 },

  // --- 7. Membership & Shares (UserProfile Tab 4) ---
  membershipId: { type: String, default: "" },
  admissionDate: { type: Date, default: null },
  sharesCount: { type: Number, default: 0 },
  shareValue: { type: Number, default: 10 },

  // --- 8. Loan & EMI Tracking ---
  activeLoanAmount: { type: Number, default: 0 },
  pendingLoanBalance: { type: Number, default: 0 },
  pendingLoanInterest: { type: Number, default: 0 },
  monthlyEmiAmount: { type: Number, default: 0 },
  remainingEmis: { type: Number, default: 0 },
  emiStartDate: { type: Date, default: null },
  emiEndDate: { type: Date, default: null },
  nextEmiDueDate: { type: Date, default: null },
  defaulterStatus: { type: Boolean, default: false },

  // --- 9. Withdrawal History ---
  withdrawalAmount: { type: Number, default: 0 },
  withdrawalDate: { type: Date, default: null },

  // --- 10. KYC & Identity ---
  kycVerified: { type: Boolean, default: false },
  aadhaarNo: { type: String, default: "" },       // UserProfile.jsx key
  aadharNumber: { type: String, default: "" },    // legacy alias (note: original typo kept)
  panNo: { type: String, default: "" },           // UserProfile.jsx key
  panNumber: { type: String, default: "" },       // legacy alias
  voterIdNo: { type: String, default: "" },

  // --- 11. Banking Details ---
  bankName: { type: String, default: "" },
  accountNumber: { type: String, default: "" },   // UserProfile.jsx key
  bankAccountNumber: { type: String, default: "" }, // legacy alias
  branchName: { type: String, default: "" },
  ifscCode: { type: String, default: "" },

  // --- 12. Nominee / Next of Kin ---
  nomineeName: { type: String, default: "" },
  nomineeRelation: { type: String, default: "" }, // UserProfile.jsx key
  nomineeRelationship: { type: String, default: "" }, // legacy alias
  nomineeContact: { type: String, default: "" },  // UserProfile.jsx key
  nomineePhone: { type: String, default: "" },    // legacy alias
  nomineeAadhaar: { type: String, default: "" },

  // --- 13. Profile Picture ---
  profilePictureUrl: { type: String, default: null },

}, {
  timestamps: true
});

// --- CRITICAL SECURITY HOOKS ---
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);
