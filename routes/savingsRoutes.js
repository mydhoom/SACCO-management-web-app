const express = require("express");
const router = express.Router();

// ==========================================
// 1. UNIFIED IMPORTS
// ==========================================
const { authenticate } = require("../middlewares/authMiddleware");

// Import everything from the controller at once
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
// 3. NEW UI ROUTES (Safe Version)
// ==========================================
router.get('/summary', authenticate, getDivisionSummary);
router.get('/summary/:memberId', authenticate, getMemberSavingsSummary);
router.get('/transactions', authenticate, getRecentTransactions);
router.get('/verify/:vendorNo', authenticate, verifyMember);
router.post('/deposit', authenticate, processDeposit);

module.exports = router;