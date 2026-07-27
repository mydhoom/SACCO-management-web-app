const TransactionLog = require('../models/TransactionLog');
const { v4: uuidv4 } = require("uuid");

/**
 * Calculate Annual Incentive Draft (Flat 10%)
 * Applied to total accumulated Share Capital per member.
 * Strictly mapped to Folio 155 (Shares) -> Folio 159 (Incentives).
 */
exports.calculateIncentiveDraft = async (req, res) => {
  try {
    // Fallback for React 'fetch' GET requests
    const financialYear = req.body.financialYear || req.query.financialYear; 
    
    if (!financialYear) {
      return res.status(400).json({ success: false, message: "Financial Year is required." });
    }

    // --- OFFICIAL SOCIETY FOLIOS ---
    const SHARE_CAPITAL_FOLIO = '155';      // Reading member shares from 155
    const INCENTIVE_PAYABLE_FOLIO = '159';  // Posting incentive drafts to 159 (Update if needed)
    // -------------------------------

    // 1. Fetch all completed Share Capital transactions
    const transactions = await TransactionLog.find({ 
      category: 'SHARE_CAPITAL', 
      ledgerFolio: SHARE_CAPITAL_FOLIO,
      status: 'COMPLETED' 
    });

    if (!transactions || transactions.length === 0) {
      return res.status(404).json({ success: false, message: "No share capital transactions found in Folio 155." });
    }

    // 2. Aggregate total active shares per member
    const memberShares = {};
    transactions.forEach(trx => {
      const memberId = trx.memberId.toString();
      if (!memberShares[memberId]) {
        memberShares[memberId] = {
          vendorNo: trx.vendorNo,
          memberId: trx.memberId,
          totalShares: 0
        };
      }
      
      if (trx.entryType === 'CREDIT') {
        memberShares[memberId].totalShares += Number(trx.amount);
      } else if (trx.entryType === 'DEBIT') {
        memberShares[memberId].totalShares -= Number(trx.amount);
      }
    });

    // 3. Calculate the FLAT 10% incentive payout for each valid member
    const rate = 0.10; // Flat 10% annually
    const calculatedBatch = [];
    const batchId = `INC-BATCH-${financialYear}-${uuidv4().split('-')[0]}`; 

    for (const memberId in memberShares) {
      const data = memberShares[memberId];
      
      if (data.totalShares > 0) {
        const incentiveAmount = parseFloat((data.totalShares * rate).toFixed(2));

        calculatedBatch.push({
          vendorNo: data.vendorNo,
          ledgerFolio: INCENTIVE_PAYABLE_FOLIO, 
          memberId: data.memberId,
          category: 'INCENTIVE_PAYOUT', 
          amount: incentiveAmount,
          entryType: 'CREDIT', 
          paymentMode: 'INTERNAL_TRANSFER', 
          transactionId: `INC-${financialYear}-${data.vendorNo}-${Date.now()}`,
          description: `Annual Share Incentive (10% Flat) for FY ${financialYear}`,
          status: 'PENDING', // Held safely in Draft mode
          batchId: batchId
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Incentive calculated successfully for ${calculatedBatch.length} members (Draft Mode).`,
      draftCount: calculatedBatch.length,
      batchId: batchId,
      preview: calculatedBatch.slice(0, 5) 
    });

  } catch (error) {
    console.error("Error calculating incentive draft:", error);
    res.status(500).json({ success: false, message: "Server error calculating incentive" });
  }
};

/**
 * Approve and Post Draft Incentive Batch to the Master Journal Ledger
 */
exports.approveAndPostIncentiveBatch = async (req, res) => {
  try {
    const { batchId, transactions } = req.body;

    if (!batchId || !transactions || transactions.length === 0) {
      return res.status(400).json({ success: false, message: "Batch ID and transaction payload required." });
    }

    // Commit draft records to active logs
    const savedTransactions = await TransactionLog.insertMany(
      transactions.map(trx => ({ ...trx, status: 'COMPLETED' }))
    );

    res.status(200).json({
      success: true,
      message: `Incentive Batch ${batchId} successfully approved and posted.`,
      postedCount: savedTransactions.length
    });

  } catch (error) {
    console.error("Error posting incentive batch:", error);
    res.status(500).json({ success: false, message: "Error posting incentive batch" });
  }
};