const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get("/", authenticate, authorize(["admin"]), generateReport);

module.exports = router;
