const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const { 
  register, 
  login, 
  bulkUpload, 
  getAllMembers, 
  deleteMember,
  getPendingUsers,
  updateUserStatus 
} = require("../controllers/authController");

const router = express.Router();

// --- EXISTING ROUTES ---
router.post("/register", register);
router.post("/login", login);
router.post("/bulk-upload", authenticate, authorize(["admin"]), bulkUpload); // Added protection
router.get("/users", authenticate, getAllMembers);
router.delete("/users/:vendorNo", authenticate, authorize(["admin"]), deleteMember);

// --- NEW ADMIN ROUTES ---
// Admin can see pending requests
router.get("/pending-users", authenticate, getPendingUsers);

// Admin can approve or reject
router.post("/approve-user/:id", authenticate, updateUserStatus);

module.exports = router;