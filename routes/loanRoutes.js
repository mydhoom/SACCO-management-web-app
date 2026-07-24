const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const { 
  requestLoan, 
  getLoans, 
  updateLoanStatus, 
  applyForLoan, // <-- Added this here!
  processEMI // <-- 1. Add this to your imports
} = require("../controllers/loanController");

const router = express.Router();

router.post("/", authenticate, authorize(["member", "admin"]), requestLoan);
router.get("/", authenticate, authorize(["admin"]), getLoans);
router.put("/:id", authenticate, authorize(["admin"]), updateLoanStatus);
router.post("/apply", authenticate, applyForLoan);
router.post("/process-emi", processEMI);

module.exports = router;