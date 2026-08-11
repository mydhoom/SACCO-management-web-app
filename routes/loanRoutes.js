const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");

// Import the controller as a single object to prevent 'undefined' unpacking errors
const loanController = require("../controllers/loanController");

const router = express.Router();

// --- EXISTING ROUTES ---
router.post("/", authenticate, authorize(["member", "admin"]), loanController.requestLoan);
router.get("/", authenticate, authorize(["admin"]), loanController.getLoans);
router.put("/:id", authenticate, authorize(["admin"]), loanController.updateLoanStatus);
router.post("/apply", authenticate, loanController.applyForLoan);
router.post("/process-emi", loanController.processEMI);
router.get("/settle-lookup/:vendorNo/:loanId", loanController.getMemberBalancesForSettlement);
router.post("/settle-via-savings", loanController.settleLoanWithSavings); 

// --- DASHBOARD ROUTES ---
router.get("/pending-transactions", authenticate, authorize(["admin"]), loanController.getPendingTransactions);
router.put("/approve-transaction/:transactionId", authenticate, authorize(["admin"]), loanController.approvePendingTransaction);
router.put("/reject-transaction/:transactionId", authenticate, authorize(["admin"]), loanController.rejectPendingTransaction);
router.get("/my-statement", authenticate, loanController.getMyLoanStatement);
router.get("/generate-demand-sheet", loanController.generateDemandSheet);

// --- NEW PASSBOOK ROUTE ---
router.get("/my-loans", authenticate, loanController.getMyLoans);

// ---> NEW ROUTE FOR ADMIN MONEY OUT <---
router.post("/approve-disbursement", authenticate, authorize(["admin"]), loanController.approveDisbursement);

module.exports = router;
