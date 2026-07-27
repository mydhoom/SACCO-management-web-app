const express = require('express');
const router = express.Router();
const User = require('../models/User');
const TransactionLog = require('../models/TransactionLog');

// ==========================================
// MAKER: Generate a Draft Batch for Review
// ==========================================
router.get('/draft', async (req, res) => {
    try {
        // Fetch only approved, active members
        const members = await User.find({ role: 'member', status: 'approved' });
        
        // Calculate the 10% flat annual incentive
        const draftBatch = members.map(member => {
            const incentiveAmount = Math.round(member.currentShareMoneyTotal * 0.10);
            
            return {
                memberId: member._id,
                vendorNo: member.vendorNo,
                name: member.name,
                currentShare: member.currentShareMoneyTotal,
                incentiveAmount: incentiveAmount
            };
        }).filter(m => m.incentiveAmount > 0); // Ignore members with 0 shares

        res.status(200).json({ 
            success: true, 
            message: "Draft batch generated successfully.",
            totalIncentivePayout: draftBatch.reduce((sum, item) => sum + item.incentiveAmount, 0),
            draftBatch 
        });
    } catch (error) {
        console.error("Error generating incentive draft:", error);
        res.status(500).json({ success: false, error: "Server error generating draft" });
    }
});

// ==========================================
// CHECKER: Approve Batch & Post to Ledgers
// ==========================================
router.post('/process', async (req, res) => {
    try {
        const { batch } = req.body; // Expects an array of approved { memberId, incentiveAmount }
        
        if (!batch || batch.length === 0) {
            return res.status(400).json({ success: false, error: "No batch data provided." });
        }

        for (let item of batch) {
            // 1. Credit the member's profile (Adding to Share Money Total)
            await User.findByIdAndUpdate(item.memberId, {
                $inc: { currentShareMoneyTotal: item.incentiveAmount }
            });

            // 2. Create the strict immutable log in the Master Journal
            await TransactionLog.create({
                memberId: item.memberId,
                transactionType: 'Credit',
                amount: item.incentiveAmount,
                description: 'Annual Incentive on Share Money (10% Flat)',
                folio: 'Share Capital' 
            });
        }

        res.status(200).json({ 
            success: true, 
            message: "Incentive batch processed and posted to Master Journal successfully!" 
        });
    } catch (error) {
        console.error("Error processing incentive batch:", error);
        res.status(500).json({ success: false, error: "Server error processing batch" });
    }
});

module.exports = router;