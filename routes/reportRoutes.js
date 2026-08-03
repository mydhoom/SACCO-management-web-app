const express = require("express");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const { generateReport } = require("../controllers/reportController");

const router = express.Router();

router.get("/", authenticate, authorize(["admin"]), generateReport);
router.get("/cashbook", authenticate, authorize(["admin"]), generateCashbook);

module.exports = router;
