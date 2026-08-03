const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

// Import everything cleanly in one block
const loanController = require('../controllers/loanController');
const { 
  requestLoan, 
  getLoans, 
  updateLoanStatus, 
  applyForLoan, 
  processEMI,
  getPendingTransactions,
  approvePendingTransaction,
  getMyLoanStatement,
  getMyLoan // <-- Added this here
} = require("../controllers/loanController");

const router = express.Router();

// --- EXISTING ROUTES ---
router.post("/", authenticate, authorize(["member", "admin"]), requestLoan);
router.get("/", authenticate, authorize(["admin"]), getLoans);
router.put("/:id", authenticate, authorize(["admin"]), updateLoanStatus);
router.post("/apply", authenticate, applyForLoan);
router.post("/process-emi", processEMI);
router.get('/settle-lookup/:vendorNo/:loanId', loanController.getMemberBalancesForSettlement);
router.post('/settle-via-savings', loanController.settleLoanWithSavings); 

// --- DASHBOARD ROUTES ---
router.get("/pending-transactions", authenticate, authorize(["admin"]), getPendingTransactions);
router.put("/approve-transaction/:transactionId", authenticate, authorize(["admin"]), approvePendingTransaction);
router.get("/my-statement", authenticate, getMyLoanStatement);
router.get('/generate-demand-sheet', loanController.generateDemandSheet);

// --- NEW PASSBOOK ROUTE ---
router.get('/my-loan', authenticate, getMyLoan);

module.exports = router;