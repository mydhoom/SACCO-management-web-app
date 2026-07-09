const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const { requestLoan, getLoans, updateLoanStatus } = require("../controllers/loanController");

const router = express.Router();

router.post("/", authenticate, authorize(["member", "admin"]), requestLoan);
router.get("/", authenticate, authorize(["admin"]), getLoans);
router.put("/:id", authenticate, authorize(["admin"]), updateLoanStatus);

module.exports = router;
