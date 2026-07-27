const TransactionLog = require('../models/TransactionLog');
const Member = require('../models/Member');

const rdPrincipalFolio = '154'; // Recurring Deposit Account Members
const rdInterestFolio = '158';  // Interest on R.D members

/**
 * Calculate Annual Simple Interest (9% p.a. on monthly products) for RD / Monthly Thrift
 * Keeps Ledger Folio strictly aligned with the savings ledger.
 */
const calculateAnnualInterestDraft = async (req, res) => {
  try {
    // FIX 1: Added req.query fallback for React GET requests
    const financialYear = req.body.financialYear || req.query.financialYear; 
    
    if (!financialYear) {
      return res.status(400).json({ success: false, message: "Financial Year is required." });
    }

    // 1. Fetch all completed thrift/savings transactions grouped by member using Folio 154
    const transactions = await TransactionLog.find({ 
      ledgerFolio: rdPrincipalFolio, 
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
          monthlyBalances: {} 
        };
      }
      
      const monthKey = new Date(trx.createdAt).toISOString().slice(0, 7); 
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
    const interestRateMonthly = 0.09 / 12; 
    const calculatedBatch = [];
    const batchId = `INT-BATCH-${financialYear}-${Date.now()}`;

    for (const memberId in memberLedgers) {
      const data = memberLedgers[memberId];
      let runningCumulativeBalance = 0;
      let totalInterestEarned = 0;

      const sortedMonths = Object.keys(data.monthlyBalances).sort();
      
      sortedMonths.forEach(month => {
        runningCumulativeBalance += data.monthlyBalances[month];
        const monthlyInterest = runningCumulativeBalance * interestRateMonthly;
        totalInterestEarned += monthlyInterest;
      });

      if (totalInterestEarned > 0) {
        calculatedBatch.push({
          vendorNo: data.vendorNo,
          ledgerFolio: rdInterestFolio, // Posts exactly to 158
          memberId: data.memberId,
          category: 'MONTHLY_THRIFT',
          amount: parseFloat(totalInterestEarned.toFixed(2)),
          entryType: 'CREDIT',
          paymentMode: 'INTERNAL_TRANSFER',
          transactionId: `INT-${financialYear}-${data.vendorNo}-${Date.now()}`,
          description: `Annual Thrift/RD Interest (9% p.a.) for FY ${financialYear}`,
          status: 'PENDING', 
          batchId: batchId
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Interest calculated successfully for ${calculatedBatch.length} members (Draft Mode).`,
      draftCount: calculatedBatch.length,
      batchId: batchId,
      preview: calculatedBatch.slice(0, 5), 
      fullBatch: calculatedBatch // FIX 2: Added full batch for the frontend to hold onto!
    });

  } catch (error) {
    console.error("Error calculating interest draft:", error);
    res.status(500).json({ success: false, message: "Server error calculating interest" });
  }
};

/**
 * Approve and Post Draft Interest Batch to the Master Journal Ledger
 */
const approveAndPostInterestBatch = async (req, res) => {
  try {
    const { batchId, transactions } = req.body;

    // FIX 3: Actually saving the transactions instead of an empty stub
    if (!batchId || !transactions || transactions.length === 0) {
      return res.status(400).json({ success: false, message: "Batch ID and transaction payload required." });
    }

    const savedTransactions = await TransactionLog.insertMany(
      transactions.map(trx => ({ ...trx, status: 'COMPLETED' }))
    );

    res.status(200).json({
      success: true,
      message: `Interest Batch ${batchId} successfully approved and posted to Folio 158.`,
      postedCount: savedTransactions.length
    });

  } catch (error) {
    console.error("Error posting interest batch:", error);
    res.status(500).json({ success: false, message: "Error posting interest batch" });
  }
};

// ==========================================
// UNIVERSAL EXPORTS (Mismatch Protection)
// ==========================================
exports.calculateAnnualInterestDraft = calculateAnnualInterestDraft;
exports.approveAndPostInterestBatch = approveAndPostInterestBatch;
exports.draftInterest = calculateAnnualInterestDraft;
exports.processInterest = approveAndPostInterestBatch;