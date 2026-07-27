const express = require('express');
const router = express.Router();

// Import the logic from the controller you already built
const { 
    draftDividends, 
    processDividends 
} = require('../controllers/dividendController');

// ==========================================
// MAKER: Generate a Draft Batch for Review
// ==========================================
router.get('/draft', draftDividends);

// ==========================================
// CHECKER: Approve Batch & Post to Ledgers
// ==========================================
router.post('/process', processDividends);

module.exports = router;