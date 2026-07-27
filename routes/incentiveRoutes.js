const express = require('express');
const router = express.Router();

const { 
    calculateIncentiveDraft, 
    approveAndPostIncentiveBatch 
} = require('../controllers/incentiveController');

// MAKER: Generate a Draft Batch for Review
router.get('/draft', calculateIncentiveDraft);

// CHECKER: Approve Batch & Post to Ledgers
router.post('/process', approveAndPostIncentiveBatch);

module.exports = router;