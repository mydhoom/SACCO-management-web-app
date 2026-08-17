const xlsx = require("xlsx"); // NEW: Required for reading the Initialization Excel file
const mongoose = require("mongoose");
const User = require("../models/User"); 
const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken"); 
const Loan = require("../models/Loan");
const TransactionLog = require("../models/TransactionLog");

// --- 1. REGISTRATION LOGIC ---
const register = async (req, res) => {
  try {
    const { name, vendorNo, designation, phoneNumber, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ vendorNo });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this Vendor Number already exists." });
    }

    // Create new user (Defaults to pending so admin can approve)
    const newUser = new User({
      name,
      vendorNo,
      designation,
      phoneNumber,
      password: password, // Let the User.js pre-save hook handle the hashing!
      status: 'pending' // Locks the account until approved
    });
    
    await newUser.save();
    res.status(201).json({ message: "Registration successful. Pending admin approval." });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Registration failed due to a server error." });
  }
};

// --- 2. LOGIN LOGIC ---
const login = async (req, res) => {
  try {
    const { vendorNo, password, loginRole } = req.body;
    
    // Find the user by Vendor Number
    const user = await User.findOne({ vendorNo });
    if (!user) return res.status(404).json({ error: "User not found. Please check your Vendor No." });

    // Check Approval Status
    if (user.status === 'pending') {
      return res.status(403).json({ error: "Your account is still pending admin approval." });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: "Account access denied by administrator." });
    }

    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid password." });

    // Validate Requested Login Role
    let finalRole = user.role || 'member';
    if (loginRole) {
      if (loginRole === 'admin' && user.role !== 'admin') {
         return res.status(403).json({ error: "Access denied. You do not have Admin privileges." });
      }
      if (loginRole === 'executive' && user.role !== 'admin' && user.role !== 'executive') {
         return res.status(403).json({ error: "Access denied. You do not have Executive privileges." });
      }
      finalRole = loginRole;
    }

    // Generate Login Token
    const secret = process.env.JWT_SECRET || 'sacco_super_secret_key';
    const token = jwt.sign({ id: user._id, role: finalRole }, secret, { expiresIn: '1d' });
    
    // Send complete user data back (excluding password)
    const userResponse = user.toObject();
    delete userResponse.password;
    userResponse.role = finalRole; // Override role in response to match their login context

    res.status(200).json({ token, user: userResponse });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed due to a server error." });
  }
};

// --- HELPER: Smart value resolvers to protect existing balances from 0 / blank overwrite ---
const resolveNumber = (incomingVal, existingVal = 0) => {
  if (incomingVal === undefined || incomingVal === null || incomingVal === '') {
    return existingVal || 0;
  }
  const cleanStr = String(incomingVal).replace(/₹|,|\s/g, '');
  const parsed = Number(cleanStr);
  if (isNaN(parsed) || parsed === 0) {
    // If incoming is 0, empty, or invalid, preserve the existing figure!
    return existingVal || 0;
  }
  return parsed;
};

const resolveString = (incomingVal, existingVal = '') => {
  if (incomingVal === undefined || incomingVal === null) return existingVal || '';
  const trimmed = String(incomingVal).trim();
  if (!trimmed || ['N/A', 'NA', 'NIL', '-', 'NULL', 'UNDEFINED'].includes(trimmed.toUpperCase())) {
    return existingVal || '';
  }
  return trimmed;
};

// --- 3. EXCEL BULK UPLOAD LOGIC ---
const bulkUpload = async (req, res) => {
  try {
    const membersData = req.body; // Array of mapped Excel data from frontend
    let added = 0;
    let updated = 0;

    for (const member of membersData) {
      const vendorNo = member.vendorNo ? String(member.vendorNo).trim() : null;
      if (!vendorNo) continue;

      const existingUser = await User.findOne({ vendorNo });
      
      if (existingUser) {
        // Smart merge: protect existing figures from 0 / blank overwrite
        existingUser.name = resolveString(member.name, existingUser.name);
        existingUser.designation = resolveString(member.designation, existingUser.designation);
        existingUser.phone = resolveString(member.phone || member.phoneNumber, existingUser.phone || existingUser.phoneNumber);
        existingUser.email = resolveString(member.email || member.emailId, existingUser.email || existingUser.emailId);
        existingUser.circle = resolveString(member.circle, existingUser.circle);
        existingUser.division = resolveString(member.division, existingUser.division);
        existingUser.subDivision = resolveString(member.subDivision, existingUser.subDivision);
        existingUser.section = resolveString(member.section || member.electricalSection, existingUser.section || existingUser.electricalSection);
        existingUser.upiId = resolveString(member.upiId, existingUser.upiId);
        existingUser.bankName = resolveString(member.bankName, existingUser.bankName);
        existingUser.accountNumber = resolveString(member.accountNumber || member.bankAccountNumber, existingUser.accountNumber || existingUser.bankAccountNumber);
        existingUser.ifscCode = resolveString(member.ifscCode, existingUser.ifscCode);
        existingUser.aadhaarNo = resolveString(member.aadhaarNo || member.aadharNumber, existingUser.aadhaarNo || existingUser.aadharNumber);
        existingUser.panNo = resolveString(member.panNo || member.panNumber, existingUser.panNo || existingUser.panNumber);

        // Smart numerical protection (0 in Excel will NOT overwrite existing balance)
        existingUser.currentShareMoneyTotal = resolveNumber(member.currentShareMoneyTotal, existingUser.currentShareMoneyTotal);
        existingUser.rdBalance = resolveNumber(member.rdBalance, existingUser.rdBalance);
        existingUser.monthlyRDAmount = resolveNumber(member.monthlyRDAmount, existingUser.monthlyRDAmount);
        existingUser.pendingLoanBalance = resolveNumber(member.pendingLoanBalance, existingUser.pendingLoanBalance);
        existingUser.pendingLoanInterest = resolveNumber(member.pendingLoanInterest, existingUser.pendingLoanInterest);
        existingUser.monthlyEmiAmount = resolveNumber(member.monthlyEmiAmount, existingUser.monthlyEmiAmount);

        await existingUser.save();
        updated++;
      } else {
        // Add new member
        member.status = 'approved';
        
        if (!member.password) {
          member.password = await bcrypt.hash(vendorNo, 10);
        }
        
        const newUser = new User(member);
        await newUser.save();
        added++;
      }
    }
    res.status(200).json({ added, updated, message: "Upload complete" });
  } catch (error) {
    console.error("Bulk Upload Error:", error);
    res.status(500).json({ error: "Failed to process the Excel data." });
  }
};

// --- 4. DIRECTORY LOGIC ---
const getAllMembers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ vendorNo: 1 });
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ error: "Error fetching directory." });
  }
};

const deleteMember = async (req, res) => {
  try {
    const { vendorNo } = req.params;
    await User.findOneAndDelete({ vendorNo });
    res.status(200).json({ message: "Member successfully removed." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete member." });
  }
};

// --- 5. APPROVAL LOGIC ---
const getPendingUsers = async (req, res) => {
  try {
    const pendingUsers = await User.find({ status: 'pending' }).select('-password');
    res.status(200).json(pendingUsers);
  } catch (error) {
    res.status(500).json({ message: "Error fetching pending users" });
  }
};

const { sendWelcomeEmail } = require('../utils/emailService');

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 

    const user = await User.findByIdAndUpdate(id, { status: status }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Send Welcome Email if approved
    if (status === 'approved' && user.emailId) {
      sendWelcomeEmail(user.emailId, user.name, user.vendorNo, 'Your Vendor Number (or the password you chose during registration)');
    }

    res.status(200).json({ message: `User ${status} successfully` });
  } catch (error) {
    res.status(500).json({ message: "Error updating user status" });
  }
};

// --- NEW: GET PROFILE LOGIC ---
const getProfile = async (req, res) => {
  try {
    // req.user comes from your 'authenticate' middleware
    const userId = req.user.id || req.user._id;

    // Find the user and exclude the password for security
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("Get Profile Error:", error);
    res.status(500).json({ error: "Failed to fetch profile data." });
  }
};
// --- 6. PROFILE UPDATE LOGIC ---
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'executive';
    const updateData = { ...req.body };

    // SECURITY: Strip masked Aadhaar values — never overwrite real data with display mask
    if (updateData.aadhaarNo && updateData.aadhaarNo.includes('****')) {
      delete updateData.aadhaarNo;
    }
    if (updateData.aadharNumber && updateData.aadharNumber.includes('****')) {
      delete updateData.aadharNumber;
    }

    // SECURITY: Non-admins cannot modify locked fields
    if (!isAdmin) {
      delete updateData.vendorNo;
      delete updateData.role;
      delete updateData.status;
      delete updateData.designation;
      delete updateData.circle;
      delete updateData.division;
      delete updateData.subDivision;
      delete updateData.joiningDate;
      delete updateData.dateOfJoining;
      delete updateData.retirementDate;
      delete updateData.dateOfRetirement;
      delete updateData.membershipId;
      delete updateData.admissionDate;
      delete updateData.sharesCount;
      delete updateData.shareValue;
      delete updateData.kycVerified;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select("-password");

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found." });
    }

    res.status(200).json({
      message: "Profile updated successfully!",
      user: updatedUser
    });
  } catch (error) {
    console.error("Update Profile Error:", error);
    res.status(500).json({ error: "Failed to update profile." });
  }
};

// --- 7. UPGRADED DATABASE PURGE LOGIC ---
const getMemberPurgeStats = async (req, res) => {
  try {
    const { memberId } = req.params;
    let query = {};
    if (mongoose.Types.ObjectId.isValid(memberId)) {
      query = { _id: memberId };
    } else {
      query = { vendorNo: memberId };
    }

    const member = await User.findOne(query).select('-password');
    if (!member) {
      return res.status(404).json({ success: false, message: "Member not found with the given ID / Vendor No." });
    }

    const [transactionsCount, loansCount] = await Promise.all([
      TransactionLog.countDocuments({ $or: [{ vendorNo: member.vendorNo }, { memberId: member._id }] }),
      Loan.countDocuments({ memberId: member._id }),
    ]);

    res.status(200).json({
      success: true,
      member,
      transactionsCount,
      loansCount
    });
  } catch (error) {
    console.error("Member Purge Stats Error:", error);
    res.status(500).json({ success: false, message: "Failed to retrieve member stats." });
  }
};

const purgeDatabase = async (req, res) => {
  try {
    const { 
      purgeScope = 'GLOBAL', // 'GLOBAL' or 'MEMBER'
      targetMemberId,
      collections = [], 
      dateCondition = 'ALL', 
      startDateTime, 
      endDateTime, 
      adminPassword 
    } = req.body;

    // Verify Admin Password using logged-in user's ID
    const adminUser = await User.findById(req.user.id || req.user._id); 
    if (!adminUser) {
      return res.status(401).json({ success: false, message: "Admin account not found." });
    }

    const isMatch = await bcrypt.compare(adminPassword, adminUser.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid admin password. Purge aborted." });
    }

    // Build the Date Filter
    let dateQuery = {};
    if (dateCondition !== 'ALL') {
      if (dateCondition === 'BEFORE' && startDateTime) {
        dateQuery = { createdAt: { $lt: new Date(startDateTime) } };
      } 
      else if (dateCondition === 'AFTER' && startDateTime) {
        dateQuery = { createdAt: { $gt: new Date(startDateTime) } };
      } 
      else if (dateCondition === 'BETWEEN' && startDateTime && endDateTime) {
        dateQuery = { 
          createdAt: { 
            $gte: new Date(startDateTime), 
            $lte: new Date(endDateTime) 
          } 
        };
      }
    }

    const details = { transactionsDeleted: 0, loansDeleted: 0, usersDeleted: 0 };

    // --- SCOPE: MEMBER-SPECIFIC PURGE ---
    if (purgeScope === 'MEMBER') {
      if (!targetMemberId) {
        return res.status(400).json({ success: false, message: "Target Member ID or Vendor Number is required." });
      }

      let memberQuery = {};
      if (mongoose.Types.ObjectId.isValid(targetMemberId)) {
        memberQuery = { _id: targetMemberId };
      } else {
        memberQuery = { vendorNo: targetMemberId };
      }

      const targetMember = await User.findOne(memberQuery);
      if (!targetMember) {
        return res.status(404).json({ success: false, message: "Selected member not found." });
      }

      if (targetMember.role === 'admin') {
        return res.status(403).json({ success: false, message: "Security Violation: Admin accounts cannot be purged or deleted." });
      }

      // 1. Transactions for this member
      if (collections.includes('TRANSACTIONS') || collections.includes('PROFILE')) {
        const txQuery = { 
          $or: [{ vendorNo: targetMember.vendorNo }, { memberId: targetMember._id }],
          ...dateQuery
        };
        const txRes = await TransactionLog.deleteMany(txQuery);
        details.transactionsDeleted = txRes.deletedCount;
      }

      // 2. Loans for this member
      if (collections.includes('LOANS') || collections.includes('PROFILE')) {
        const loanQuery = { memberId: targetMember._id, ...dateQuery };
        const loanRes = await Loan.deleteMany(loanQuery);
        details.loansDeleted = loanRes.deletedCount;
      }

      // 3. Complete Profile deletion
      if (collections.includes('PROFILE') || collections.includes('USERS')) {
        const userRes = await User.deleteOne({ _id: targetMember._id });
        details.usersDeleted = userRes.deletedCount;
      }

      details.targetMember = {
        name: targetMember.name,
        vendorNo: targetMember.vendorNo,
        designation: targetMember.designation
      };

      return res.status(200).json({
        success: true,
        message: `Member data for "${targetMember.name}" (${targetMember.vendorNo}) purged successfully.`,
        details
      });
    }

    // --- SCOPE: GLOBAL PURGE ---
    if (collections.includes('TRANSACTIONS')) {
      const result = await TransactionLog.deleteMany(dateQuery);
      details.transactionsDeleted = result.deletedCount;
    }
    if (collections.includes('LOANS')) {
      const result = await Loan.deleteMany(dateQuery);
      details.loansDeleted = result.deletedCount;
    }
    if (collections.includes('USERS')) {
      // CRITICAL: Never delete the admin account!
      const userQuery = { ...dateQuery, role: { $ne: 'admin' } }; 
      const result = await User.deleteMany(userQuery);
      details.usersDeleted = result.deletedCount;
    }

    res.status(200).json({ success: true, message: "Database purge completed successfully.", details });
  } catch (error) {
    console.error("Purge Error:", error);
    res.status(500).json({ success: false, message: "Server error during database purge." });
  }
};

const AuditLog = require("../models/AuditLog"); // Added for Audit Logging

// --- 8. SYSTEM INITIALIZATION LOGIC (FLEXIBLE EXCEL UPLOAD) ---
const systemInitialization = async (req, res) => {
  try {
    const { asOfDate, bankBalance, cashInHand, rows } = req.body;
    
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ success: false, message: "Valid JSON data array (rows) is required." });
    }
    if (!asOfDate) {
      return res.status(400).json({ success: false, message: "The 'As Of' date is required." });
    }

    const initDate = new Date(asOfDate);
    const openingBank = Number(bankBalance) || 0;
    const openingCash = Number(cashInHand) || 0;
    const totalSocietyFunds = openingBank + openingCash;

    let usersCreated = 0;
    let loansCreated = 0;

    for (const row of rows) {
      const vendorNo = row['Vendor_No'] ? String(row['Vendor_No']).trim() : null;
      if (!vendorNo) continue; 

      let user = await User.findOne({ vendorNo });
      
      if (!user) {
        // Brand new user: initialize with Excel values or clean defaults
        user = new User({
          vendorNo: vendorNo,
          societyAccountNo: resolveString(row['Society_Account_No'], ''),
          name: resolveString(row['Full_Name'], 'Unknown Member'),
          designation: resolveString(row['Designation'], 'N/A'),
          phone: resolveString(row['Phone'], ''),
          email: resolveString(row['Email'], ''),
          circle: resolveString(row['Circle'], ''),
          division: resolveString(row['Division'], ''),
          subDivision: resolveString(row['Sub_Division'], ''),
          section: resolveString(row['Section'], ''),
          upiId: resolveString(row['UPI_ID'], ''),
          bankName: resolveString(row['Bank_Name'], ''),
          accountNumber: resolveString(row['Bank_Account_Number'], ''),
          ifscCode: resolveString(row['IFSC_Code'], ''),
          aadhaarNo: resolveString(row['Aadhar_Number'], ''),
          panNo: resolveString(row['PAN_Number'], ''),
          nomineeName: resolveString(row['Nominee_Name'], ''),
          nomineeRelation: resolveString(row['Nominee_Relationship'], ''),
          nomineeContact: resolveString(row['Nominee_Phone'], ''),

          // Initial balances (0 if not in sheet)
          currentShareMoneyTotal: resolveNumber(row['Opening_Share_Balance'], 0),
          rdBalance: resolveNumber(row['Opening_RD_Balance'], 0),
          monthlyRDAmount: resolveNumber(row['Monthly_RD_Amount'], 0),
          pendingLoanBalance: resolveNumber(row['Opening_Principal_Pending'], 0), 
          pendingLoanInterest: resolveNumber(row['Opening_Interest_Pending'], 0),
          monthlyEmiAmount: resolveNumber(row['Current_EMI_Amount'], 0),

          role: 'member',
          password: 'DefaultPassword123!', 
          status: 'APPROVED'
        });
        await user.save();
        usersCreated++;
      } else {
        // EXISTING MEMBER: Smart Merge (0 or blank cell in Excel NEVER overwrites existing data)
        user.societyAccountNo = resolveString(row['Society_Account_No'], user.societyAccountNo);
        user.name = resolveString(row['Full_Name'], user.name);
        user.designation = resolveString(row['Designation'], user.designation);
        user.phone = resolveString(row['Phone'], user.phone || user.phoneNumber);
        user.email = resolveString(row['Email'], user.email || user.emailId);
        user.circle = resolveString(row['Circle'], user.circle);
        user.division = resolveString(row['Division'], user.division);
        user.subDivision = resolveString(row['Sub_Division'], user.subDivision);
        user.section = resolveString(row['Section'], user.section || user.electricalSection);
        user.upiId = resolveString(row['UPI_ID'], user.upiId);
        user.bankName = resolveString(row['Bank_Name'], user.bankName);
        user.accountNumber = resolveString(row['Bank_Account_Number'], user.accountNumber || user.bankAccountNumber);
        user.ifscCode = resolveString(row['IFSC_Code'], user.ifscCode);
        user.aadhaarNo = resolveString(row['Aadhar_Number'], user.aadhaarNo || user.aadharNumber);
        user.panNo = resolveString(row['PAN_Number'], user.panNo || user.panNumber);
        user.nomineeName = resolveString(row['Nominee_Name'], user.nomineeName);
        user.nomineeRelation = resolveString(row['Nominee_Relationship'], user.nomineeRelation || user.nomineeRelationship);
        user.nomineeContact = resolveString(row['Nominee_Phone'], user.nomineeContact || user.nomineePhone);

        // Smart Numerical Protection: 0 in Excel is IGNORED, old figures are kept intact!
        user.currentShareMoneyTotal = resolveNumber(row['Opening_Share_Balance'], user.currentShareMoneyTotal);
        user.rdBalance = resolveNumber(row['Opening_RD_Balance'], user.rdBalance);
        user.monthlyRDAmount = resolveNumber(row['Monthly_RD_Amount'], user.monthlyRDAmount);
        user.pendingLoanBalance = resolveNumber(row['Opening_Principal_Pending'], user.pendingLoanBalance);
        user.pendingLoanInterest = resolveNumber(row['Opening_Interest_Pending'], user.pendingLoanInterest);
        user.monthlyEmiAmount = resolveNumber(row['Current_EMI_Amount'], user.monthlyEmiAmount);

        await user.save();
      }

      // --- LOAN HANDLING ---
      const incomingPrincipal = resolveNumber(row['Opening_Principal_Pending'], 0);
      const incomingInterest  = resolveNumber(row['Opening_Interest_Pending'], 0);
      const incomingEmi       = resolveNumber(row['Current_EMI_Amount'], 0);
      const incomingLoanId    = resolveString(row['Active_Loan_ID'], '');

      if (incomingPrincipal > 0 || incomingInterest > 0) {
        const loanIdToUse = incomingLoanId || `LN-${vendorNo}-${Date.now()}`;

        // Check if member already has an active loan or matching loanId
        let existingLoan = await Loan.findOne({
          $or: [
            { loanId: loanIdToUse },
            { memberId: user._id, status: 'ACTIVE' }
          ]
        });

        if (existingLoan) {
          // Update existing active loan balances if incoming figures are positive
          if (incomingPrincipal > 0) existingLoan.principalPending = incomingPrincipal;
          if (incomingInterest > 0) existingLoan.interestPending = incomingInterest;
          if (incomingEmi > 0) existingLoan.emiAmount = incomingEmi;
          await existingLoan.save();
        } else {
          // Create new active loan
          const newLoan = new Loan({
            memberId: user._id,
            loanId: loanIdToUse,
            loanAmount: incomingPrincipal,
            principalPending: incomingPrincipal,
            interestPending: incomingInterest,
            emiAmount: incomingEmi,
            status: 'ACTIVE',
            issuedDate: initDate 
          });
          await newLoan.save();
          loansCreated++;
        }
      }
    }

    // Create the Master Journal Entry for Opening Balances
    if (totalSocietyFunds > 0) {
      const openingLedgerEntry = new TransactionLog({
        transactionDate: initDate,
        amount: totalSocietyFunds,
        entryType: 'CREDIT', 
        paymentMode: 'BANK/CASH',
        category: 'System Migration',
        description: `System Initialization Opening Balance (Bank: ${openingBank}, Cash: ${openingCash})`,
        ledgerFolio: 'OPENING-BAL',
        status: 'COMPLETED'
      });
      await openingLedgerEntry.save();
    }

    // AUDIT LOGGING
    const adminId = req.user.id;
    const logDetails = `Uploaded ${usersCreated} Users & ${loansCreated} Loans. Master Date: ${initDate.toLocaleDateString('en-GB')}.`;
    await AuditLog.create({
      userId: adminId, // Using userId to match schema
      action: "MASTER_DATA_INITIALIZATION",
      details: logDetails
    });

    res.status(200).json({
      success: true,
      message: `System successfully initialized as of ${initDate.toLocaleDateString('en-GB')}.`,
      details: {
        totalRowsProcessed: rows.length,
        usersCreated,
        loansCreated,
        societyFundsLogged: totalSocietyFunds
      }
    });

  } catch (error) {
    console.error("Initialization Error:", error);
    res.status(500).json({ success: false, message: "Server error during initialization." });
  }
};

// --- EXPORT EVERYTHING ---
module.exports = { 
  register, 
  login, 
  bulkUpload, 
  getAllMembers, 
  deleteMember,
  getPendingUsers,
  updateUserStatus,
  getProfile,
  updateProfile,
  purgeDatabase,
  getMemberPurgeStats,
  systemInitialization 
};