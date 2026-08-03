const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, authorize } = require("../middleware/auth"); // if needed elsewhere

router.get("/", authenticate, authorize(["admin"]), reportController.generateReport);
router.get("/cashbook", reportController.generateCashbook);

module.exports = router;
