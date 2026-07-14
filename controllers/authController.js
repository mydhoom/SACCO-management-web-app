const User = require("../models/User"); 
const bcrypt = require("bcryptjs"); 
const jwt = require("jsonwebtoken"); // Required for creating the adminToken

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

    // Generate Login Token (Using your environment secret or a fallback)
    const secret = process.env.JWT_SECRET || 'sacco_super_secret_key';
    const token = jwt.sign({ id: user._id, role: user.role || 'member' }, secret, { expiresIn: '1d' });
    
    res.status(200).json({ token, user: { name: user.name, vendorNo: user.vendorNo, role: user.role } });
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
        // Add new member (Automatically approved since it comes from official Excel)
        member.status = 'approved';
        
        // Give them a default password if they don't have one (e.g., their Vendor No)
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
    // Fetch all approved members, leaving out their passwords for security
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

// --- 5. APPROVAL LOGIC (Your New Features) ---
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

// --- EXPORT EVERYTHING ---
module.exports = { 
  register, 
  login, 
  bulkUpload, 
  getAllMembers, 
  deleteMember,
  getPendingUsers,
  updateUserStatus 
};