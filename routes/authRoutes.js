const express = require("express");
const multer = require("multer"); // ADDED: Required for Excel file uploads
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const { 
  register, 
  login, 
  bulkUpload, 
  getAllMembers, 
  deleteMember,
  getPendingUsers,
  updateUserStatus,
  updateProfile,
  getProfile,           // <--- ADDED
  purgeDatabase,            // Added Purge Function
  systemInitialization      // Added Excel Initialization Function
} = require("../controllers/authController");

const router = express.Router();

// REMOVED DUPLICATE: Configure Multer to store the uploaded Excel file in memory
const upload = multer({ storage: multer.memoryStorage() });

// --- EXISTING ROUTES ---
router.post("/register", register);
router.post("/login", login);
router.post("/bulk-upload", authenticate, authorize(["admin"]), bulkUpload);
router.get("/users", authenticate, getAllMembers);
router.delete("/users/:vendorNo", authenticate, authorize(["admin"]), deleteMember);

// --- NEW ADMIN ROUTES ---
// Admin can see pending requests
router.get("/pending-users", authenticate, getPendingUsers);

// Admin can approve or reject
router.post("/approve-user/:id", authenticate, updateUserStatus);

// --- PROFILE ROUTES ---
// Fixes PUT https://sacco-management-web-app.onrender.com/api/auth/profile/update
router.put("/profile/update", authenticate, updateProfile);

// NEW: Fetch profile data for the Passbook
router.get("/profile", authenticate, getProfile);

// 1. Database Purge
router.post("/purge", authenticate, authorize(["admin"]), purgeDatabase);

// --- INITIALIZATION ROUTE ---
// Notice we use upload.single('masterFile') to catch the Excel file from the frontend
router.post(
  "/system-init", 
  authenticate, 
  authorize(["admin"]), 
  upload.single("masterFile"), 
  systemInitialization
);

module.exports = router;