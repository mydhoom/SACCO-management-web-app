const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// Route to generate the Master Cashbook
router.get('/cashbook', reportController.generateCashbook);

module.exports = router;
