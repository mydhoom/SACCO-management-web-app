const TransactionLog = require('../models/TransactionLog');
const Member = require('../models/Member');
const { v4: uuidv4 } = require("uuid");

/**
 * Calculate Annual Dividend Draft based on AGM declared percentage
 * Applied to total accumulated Share Capital per member.
 * Strictly mapped to The Mahadev Nagar Society's exact Folio Numbers.
 */
exports.calculateDividendDraft = async (req, res) => {
  try {
    const { financialYear, dividendPercentage } = req.body; 
    
    if (!financialYear || !dividendPercentage) {
      return res.status(400).json({ success: false, message: "Financial Year and Dividend Percentage are required." });
    }

    // --- OFFICIAL SOCIETY FOLIOS ---
    const SHARE_CAPITAL_FOLIO = '155';      // Reading member shares from 155
    const DIVIDEND_PAYABLE_FOLIO = '158';  // Posting dividend drafts to 158
    // -------------------------------

    // 1. Fetch all completed Share Capital transactions from Folio 155
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
      
      // Credits mean they bought/were deducted shares. Debits mean shares were withdrawn/refunded.
      if (trx.entryType === 'CREDIT') {
        memberShares[memberId].totalShares += Number(trx.amount);
      } else if (trx.entryType === 'DEBIT') {
        memberShares[memberId].totalShares -= Number(trx.amount);
      }
    });

    // 3. Calculate the dividend payout for each valid member and map to Folio 158
    const rate = parseFloat(dividendPercentage) / 100;
    const calculatedBatch = [];
    const batchId = `DIV-BATCH-${financialYear}-${uuidv4().split('-')[0]}`; 

    for (const memberId in memberShares) {
      const data = memberShares[memberId];
      
      if (data.totalShares > 0) {
        const dividendAmount = parseFloat((data.totalShares * rate).toFixed(2));

        calculatedBatch.push({
          vendorNo: data.vendorNo,
          ledgerFolio: DIVIDEND_PAYABLE_FOLIO, // <-- Crucial: Maps payout to Folio 158
          memberId: data.memberId,
          category: 'DIVIDEND_PAYOUT', 
          amount: dividendAmount,
          entryType: 'CREDIT', 
          paymentMode: 'INTERNAL_TRANSFER', 
          transactionId: `DIV-${financialYear}-${data.vendorNo}-${Date.now()}`,
          description: `Annual Share Dividend (${dividendPercentage}%) for FY ${financialYear}`,
          status: 'PENDING', // Held safely in Draft mode
          batchId: batchId
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Dividend calculated successfully for ${calculatedBatch.length} members (Draft Mode).`,
      draftCount: calculatedBatch.length,
      batchId: batchId,
      preview: calculatedBatch.slice(0, 5) // Return sample for admin preview table
    });

  } catch (error) {
    console.error("Error calculating dividend draft:", error);
    res.status(500).json({ success: false, message: "Server error calculating dividend" });
  }
};

/**
 * Approve and Post Draft Dividend Batch to the Master Journal Ledger
 */
exports.approveAndPostDividendBatch = async (req, res) => {
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
      message: `Dividend Batch ${batchId} successfully approved and posted to Folio 158.`,
      postedCount: savedTransactions.length
    });

  } catch (error) {
    console.error("Error posting dividend batch:", error);
    res.status(500).json({ success: false, message: "Error posting dividend batch" });
  }
};