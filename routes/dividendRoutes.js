const express = require('express');
const router = express.Router();

// 1. FIXED: Matching the exact names exported by the controller
const { 
    calculateDividendDraft, 
    approveAndPostDividendBatch 
} = require('../controllers/dividendController');

// 2. FIXED: Using the corrected names in the routes
router.get('/draft', calculateDividendDraft);
router.post('/process', approveAndPostDividendBatch);

module.exports = router;