const express = require("express");
const router = express.Router();

// ==========================================
// 1. UNIFIED IMPORTS
// ==========================================
// Middleware to protect routes and verify tokens
const { authenticate } = require("../middlewares/authMiddleware");

// Import all required controller functions
const { 
  addSavings, 
  getSavings,
  getDivisionSummary,
  getMemberSavingsSummary,
  getRecentTransactions,
  processDeposit,
  verifyMember
} = require("../controllers/savingsController");

// ==========================================
// 2. EXISTING ROUTES
// ==========================================
router.post("/", authenticate, addSavings);
router.get("/", authenticate, getSavings);

// ==========================================
// 3. NEW UI ROUTES (Transaction Processing)
// ==========================================
router.get("/summary", authenticate, getDivisionSummary);
router.get("/summary/:memberId", authenticate, getMemberSavingsSummary);
router.get("/transactions", authenticate, getRecentTransactions);

// The exact route your React frontend is looking for:
router.get("/verify/:vendorNo", authenticate, verifyMember);
router.post("/deposit", authenticate, processDeposit);

module.exports = router;