const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
// ADD THIS LINE to import your controller
const loanController = require('../controllers/loanController');
const { 
  requestLoan, 
  getLoans, 
  updateLoanStatus, 
  applyForLoan, 
  processEMI,
  getPendingTransactions,
  approvePendingTransaction,
  getMyLoanStatement
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
// --- NEW DASHBOARD ROUTES ---
// 1. Admin Clearance Dashboard: Fetch all pending cheques
router.get("/pending-transactions", authenticate, authorize(["admin"]), getPendingTransactions);

// 2. Admin Clearance Dashboard: Approve a specific transaction
router.put("/approve-transaction/:transactionId", authenticate, authorize(["admin"]), approvePendingTransaction);

// 3. Member Dashboard: Fetch only their own personal loan statement
router.get("/my-statement", authenticate, getMyLoanStatement);
// ADD THIS LINE IF IT IS MISSING:
router.get('/generate-demand-sheet', loanController.generateDemandSheet);

module.exports = router;
