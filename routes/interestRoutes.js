const express = require("express");
const router = express.Router();
const { 
  calculateAnnualInterestDraft, 
  approveAndPostInterestBatch 
} = require("../controllers/interestController");

// Route to calculate the Draft Batch (End of FY)
router.post("/calculate-draft", calculateAnnualInterestDraft);

// Route to Post the Draft Batch to the Master Journal
router.post("/approve-batch", approveAndPostInterestBatch);

module.exports = router;