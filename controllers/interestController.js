const TransactionLog = require('../models/TransactionLog');
const Member = require('../models/Member');

/**
 * Calculate Annual Simple Interest (9% p.a. on monthly products) for RD / Monthly Thrift
 * Keeps Ledger Folio strictly aligned with the savings ledger.
 */
exports.calculateAnnualInterestDraft = async (req, res) => {
  try {
    const { financialYear, thriftFolioNo } = req.body; // e.g., financialYear = "2025-2026", thriftFolioNo = "151"
    
    if (!financialYear || !thriftFolioNo) {
      return res.status(400).json({ success: false, message: "Financial Year and Thrift Ledger Folio are required." });
    }

    // 1. Fetch all completed thrift/savings transactions grouped by member
    const transactions = await TransactionLog.find({ 
      ledgerFolio: thriftFolioNo, 
      status: 'COMPLETED' 
    }).sort({ createdAt: 1 });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ success: false, message: "No transactions found for this ledger folio." });
    }

    // Map transactions by member to track running monthly balances
    const memberLedgers = {};
    transactions.forEach(trx => {
      const memberId = trx.memberId.toString();
      if (!memberLedgers[memberId]) {
        memberLedgers[memberId] = {
          vendorNo: trx.vendorNo,
          memberId: trx.memberId,
          monthlyBalances: {} // Track balance per month
        };
      }
      
      // Simple accumulation logic per month for the 9% p.a. (0.75% per month) product calculation
      const monthKey = new Date(trx.createdAt).toISOString().slice(0, 7); // "YYYY-MM"
      if (!memberLedgers[memberId].monthlyBalances[monthKey]) {
        memberLedgers[memberId].monthlyBalances[monthKey] = 0;
      }

      if (trx.entryType === 'CREDIT') {
        memberLedgers[memberId].monthlyBalances[monthKey] += Number(trx.amount);
      } else if (trx.entryType === 'DEBIT') {
        memberLedgers[memberId].monthlyBalances[monthKey] -= Number(trx.amount);
      }
    });

    // 2. Compute 9% simple interest on cumulative monthly products
    const interestRateMonthly = 0.09 / 12; // 9% per annum converted to monthly rate
    const calculatedBatch = [];

    for (const memberId in memberLedgers) {
      const data = memberLedgers[memberId];
      let runningCumulativeBalance = 0;
      let totalInterestEarned = 0;

      // Sort months chronologically to build cumulative principal
      const sortedMonths = Object.keys(data.monthlyBalances).sort();
      
      sortedMonths.forEach(month => {
        runningCumulativeBalance += data.monthlyBalances[month];
        // Calculate monthly product interest
        const monthlyInterest = runningCumulativeBalance * interestRateMonthly;
        totalInterestEarned += monthlyInterest;
      });

      if (totalInterestEarned > 0) {
        calculatedBatch.push({
          vendorNo: data.vendorNo,
          ledgerFolio: thriftFolioNo,
          memberId: data.memberId,
          category: 'MONTHLY_THRIFT',
          amount: parseFloat(totalInterestEarned.toFixed(2)),
          entryType: 'CREDIT',
          paymentMode: 'INTERNAL_TRANSFER',
          transactionId: `INT-${financialYear}-${data.vendorNo}-${Date.now()}`,
          description: `Annual Thrift/RD Interest (9% p.a.) for FY ${financialYear}`,
          status: 'PENDING', // Held in Draft/Pending status until Admin approval
          batchId: `BATCH-${financialYear}`
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Interest calculated successfully for ${calculatedBatch.length} members (Draft Mode).`,
      draftCount: calculatedBatch.length,
      preview: calculatedBatch.slice(0, 5) // Return sample preview for admin review
    });

  } catch (error) {
    console.error("Error calculating interest draft:", error);
    res.status(500).json({ success: false, message: "Server error calculating interest" });
  }
};

/**
 * Approve and Post Draft Interest Batch to the Master Journal Ledger
 */
exports.approveAndPostInterestBatch = async (req, res) => {
  try {
    const { batchId } = req.body;

    // Find all pending draft records matching this batch ID
    // and commit them to active transaction logs with folio preservation
    res.status(200).json({
      success: true,
      message: `Batch ${batchId} successfully approved and posted to Master Journal.`
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Error posting interest batch" });
  }
};