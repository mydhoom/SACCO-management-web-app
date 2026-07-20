const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const { 
  requestLoan, 
  getLoans, 
  updateLoanStatus, 
  applyForLoan // <-- Added this here!
} = require("../controllers/loanController");

const router = express.Router();

router.post("/", authenticate, authorize(["member", "admin"]), requestLoan);
router.get("/", authenticate, authorize(["admin"]), getLoans);
router.put("/:id", authenticate, authorize(["admin"]), updateLoanStatus);

// Route for members to apply for a loan
router.post("/apply", authenticate, applyForLoan);

module.exports = router;