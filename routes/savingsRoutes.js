const express = require("express");
const router = express.Router();

// ==========================================
// 1. EXISTING IMPORTS (Kept Intact)
// ==========================================
const { authenticate } = require("../middlewares/authMiddleware");
const { addSavings, getSavings } = require("../controllers/savingsController");

// ==========================================
// 2. NEW IMPORTS (For ShareSavings.jsx UI)
// ==========================================
// Ensure these are added to your controllers and middleware files
const {
  getDivisionSummary,
  getMemberSavingsSummary,
  getRecentTransactions,
  processDeposit,
  verifyMember
} = require("../controllers/savingsController");

// If you do not have authorizeAdmin or auditLogger yet, you can remove them from the routes below 
// or implement them in your authMiddleware/auditLogger files.
const { authorizeAdmin } = require("../middlewares/authMiddleware"); 
const auditLogger = require("../middlewares/auditLogger");

// ==========================================
// 3. EXISTING ROUTES (Kept Intact)
// ==========================================
router.post("/", authenticate, addSavings);
router.get("/", authenticate, getSavings);

// ==========================================
// 4. NEW ROUTES (For Share & Savings Ledger)
// ==========================================

/**
 * @route   GET /api/savings/summary
 * @desc    Get division-wide totals for Share Capital, Mandatory, and Voluntary savings
 */
router.get('/summary', authenticate, authorizeAdmin, getDivisionSummary);

/**
 * @route   GET /api/savings/summary/:memberId
 * @desc    Get specific savings and share balances for a single member
 */
router.get('/summary/:memberId', authenticate, getMemberSavingsSummary);

/**
 * @route   GET /api/savings/transactions
 * @desc    Get recent deposit/withdrawal transactions for the ledger
 */
router.get('/transactions', authenticate, authorizeAdmin, getRecentTransactions);

/**
 * @route   GET /api/savings/verify/:vendorNo
 * @desc    Verify member exists and get their name
 */
router.get('/verify/:vendorNo', authenticate, verifyMember);

/**
 * @route   POST /api/savings/deposit
 * @desc    Process a new Share, Mandatory, or Voluntary deposit with advanced logging
 */
router.post(
  '/deposit', 
  authenticate, 
  authorizeAdmin, 
  auditLogger('Processed Savings/Share Deposit'), 
  processDeposit
);

module.exports = router;