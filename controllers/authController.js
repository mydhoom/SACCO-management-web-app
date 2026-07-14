const User = require("../models/User"); // Assuming your User model is here
const bcrypt = require("bcryptjs"); // Or your existing auth library

// --- EXISTING FUNCTIONS (Ensure you keep your existing implementation) ---
const register = async (req, res) => { /* Your original logic here */ };
const login = async (req, res) => { /* Your original logic here */ };
const bulkUpload = async (req, res) => { /* Your original logic here */ };
const getAllMembers = async (req, res) => { /* Your original logic here */ };
const deleteMember = async (req, res) => { /* Your original logic here */ };

// --- NEW FUNCTIONS FOR APPROVALS ---

// Fetch all users with 'pending' status
const getPendingUsers = async (req, res) => {
  try {
    const pendingUsers = await User.find({ status: 'pending' });
    res.status(200).json(pendingUsers);
  } catch (error) {
    res.status(500).json({ message: "Error fetching pending users", error });
  }
};

// Approve or Reject a user
const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // Expecting 'approved' or 'rejected'

    const user = await User.findByIdAndUpdate(
      id, 
      { status: status }, 
      { new: true }
    );

    if (!user) return res.status(404).json({ message: "User not found" });

    res.status(200).json({ message: `User ${status} successfully` });
  } catch (error) {
    res.status(500).json({ message: "Error updating user status", error });
  }
};

module.exports = { 
  register, 
  login, 
  bulkUpload, 
  getAllMembers, 
  deleteMember,
  getPendingUsers,
  updateUserStatus 
};