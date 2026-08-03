const xlsx = require("xlsx"); // NEW: Required for reading the Initialization Excel file
const User = require("../models/User"); 
const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken"); 
const Loan = require("../models/Loan");
const TransactionLog = require("../models/TransactionLog");

// --- 1. REGISTRATION LOGIC ---
const register = async (req, res) => {
  try {
    const { name, vendorNo, designation, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ vendorNo });
    if (existingUser) {
      return res.status(400).json({ error: "An account with this Vendor Number already exists." });
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user (Defaults to pending so admin can approve)
    const newUser = new User({
      name,
      vendorNo,
      designation,
      password: hashedPassword,
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
    const { vendorNo, password } = req.body;
    
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

    // Generate Login Token
    const secret = process.env.JWT_SECRET || 'sacco_super_secret_key';
    const token = jwt.sign({ id: user._id, role: user.role || 'member' }, secret, { expiresIn: '1d' });
    
    // Send complete user data back (excluding password)
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({ token, user: userResponse });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Login failed due to a server error." });
  }
};

// --- 3. EXCEL BULK UPLOAD LOGIC ---
const bulkUpload = async (req, res) => {
  try {
    const membersData = req.body; // Array of mapped Excel data from frontend
    let added = 0;
    let updated = 0;

    for (const member of membersData) {
      const existingUser = await User.findOne({ vendorNo: member.vendorNo });
      
      if (existingUser) {
        // Update financials for existing member
        await User.updateOne({ vendorNo: member.vendorNo }, { $set: member });
        updated++;
      } else {
        // Add new member
        member.status = 'approved';
        
        if (!member.password) {
          member.password = await bcrypt.hash(member.vendorNo, 10);
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
    const users = await User.find({ status: 'approved' }).select('-password');
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

const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; 

    const user = await User.findByIdAndUpdate(id, { status: status }, { new: true });
    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: `User ${status} successfully` });
  } catch (error) {
    res.status(500).json({ message: "Error updating user status" });
  }
};

// --- 6. PROFILE UPDATE LOGIC ---
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: req.body },
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
const purgeDatabase = async (req, res) => {
  try {
    const { collections, dateCondition, startDateTime, endDateTime, adminPassword } = req.body;

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

// --- 8. SYSTEM INITIALIZATION LOGIC (FLEXIBLE EXCEL UPLOAD) ---
const systemInitialization = async (req, res) => {
  try {
    const { asOfDate, bankBalance, cashInHand } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Master Excel file is required." });
    }
    if (!asOfDate) {
      return res.status(400).json({ success: false, message: "The 'As Of' date is required." });
    }

    const initDate = new Date(asOfDate);
    const openingBank = Number(bankBalance) || 0;
    const openingCash = Number(cashInHand) || 0;
    const totalSocietyFunds = openingBank + openingCash;

    // Read Excel File from memory
    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; 
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    let usersCreated = 0;
    let loansCreated = 0;

    for (const row of rows) {
      const vendorNo = row['Vendor_No'] ? String(row['Vendor_No']).trim() : null;
      if (!vendorNo) continue; 

      let user = await User.findOne({ vendorNo });
      
      if (!user) {
        user = new User({
          vendorNo: vendorNo,
          name: row['Full_Name'] || 'Unknown',
          designation: row['Designation'] || 'N/A',
          phone: row['Phone'] || '',
          email: row['Email'] || '',
          circle: row['Circle'] || '',
          division: row['Division'] || '',
          subDivision: row['Sub_Division'] || '',
          section: row['Section'] || '',

          // --- UPDATED TO MATCH YOUR EXACT SCHEMA ---
          currentShareMoneyTotal: Number(row['Opening_Share_Balance']) || 0,
          rdBalance: Number(row['Opening_RD_Balance']) || 0,
          monthlyRDAmount: Number(row['Monthly_RD_Amount']) || 0,
          pendingLoanBalance: Number(row['Opening_Principal_Pending']) || 0, 
          monthlyEmiAmount: Number(row['Current_EMI_Amount']) || 0,

          role: 'member',
          password: 'DefaultPassword123!', 
          status: 'APPROVED'
        });
        await user.save();
        usersCreated++;
      } else {
        // --- UPDATED TO MATCH YOUR EXACT SCHEMA ---
        user.currentShareMoneyTotal = Number(row['Opening_Share_Balance']) || user.currentShareMoneyTotal;
        user.rdBalance = Number(row['Opening_RD_Balance']) || user.rdBalance;
        user.monthlyRDAmount = Number(row['Monthly_RD_Amount']) || user.monthlyRDAmount;
        user.pendingLoanBalance = Number(row['Opening_Principal_Pending']) || user.pendingLoanBalance;
        user.monthlyEmiAmount = Number(row['Current_EMI_Amount']) || user.monthlyEmiAmount;
        await user.save();
      }

      const pendingPrincipal = Number(row['Opening_Principal_Pending']) || 0;
      const pendingInterest = Number(row['Opening_Interest_Pending']) || 0; // NEW ADDITION
      
      if (pendingPrincipal > 0 || pendingInterest > 0) { // Check both!
        const newLoan = new Loan({
          memberId: user._id,
          loanId: row['Active_Loan_ID'] || `LN-${vendorNo}-${Date.now()}`,
          principalPending: pendingPrincipal,
          interestPending: pendingInterest, // NEW ADDITION
          emiAmount: Number(row['Current_EMI_Amount']) || 0,
          status: 'ACTIVE',
          issuedDate: initDate 
        });
        await newLoan.save();
        loansCreated++;
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
  updateProfile,
  purgeDatabase,
  systemInitialization 
};  