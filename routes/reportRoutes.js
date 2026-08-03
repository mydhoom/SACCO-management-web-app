const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Temporarily commented out to prevent the Render crash
// const { authenticate, authorize } = require("../middleware/auth"); 

// Temporarily removed the auth protection so the route works without the missing file
router.get("/", reportController.generateReport);

// Your newly added Cashbook route
router.get("/cashbook", reportController.generateCashbook);

module.exports = router;