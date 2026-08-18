// controllers/demandController.js
// Handles Monthly Payroll Demand Recovery Sheet, Batch Creation, Member Clearance, BRS Memo
const { v4: uuidv4 } = require('uuid');
const User          = require('../models/User');
const Loan          = require('../models/Loan');
const DemandBatch   = require('../models/DemandBatch');
const TransactionLog = require('../models/TransactionLog');
const LedgerService = require('../services/LedgerService');

const DEFAULT_RATE = 0.10; // 10% fallback annual rate

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: compute principal/interest split for a single EMI payment
// ─────────────────────────────────────────────────────────────────────────────
function splitEMI(outstandingBalance = 0, monthlyEMI = 0, annualRate = DEFAULT_RATE) {
  const monthlyRate  = annualRate / 12;
  const interestDue  = parseFloat((outstandingBalance * monthlyRate).toFixed(2));
  const principalDue = parseFloat(Math.max(monthlyEMI - interestDue, 0).toFixed(2));
  // cap principal to not exceed outstanding
  const cappedPrincipal = Math.min(principalDue, outstandingBalance);
  const totalDue = parseFloat((cappedPrincipal + interestDue).toFixed(2));
  return { interestDue, principalDue: cappedPrincipal, totalDue };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: compute financial year string from a given month and year
// ─────────────────────────────────────────────────────────────────────────────
function getFinancialYear(month, year) {
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const monthIdx = MONTHS.indexOf(month); // 0-indexed
  // FY runs April to March. Months April(3)-December(11) belong to FY startYear-startYear+1
  if (monthIdx >= 3) { // April - December
    return `${year}-${year + 1}`;
  } else { // January - March
    return `${year - 1}-${year}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demand/generate
// Auto-generates the demand list for a target month. Includes ALL members who
// have active loans OR an RD contribution, including brand-new loaners.
// ─────────────────────────────────────────────────────────────────────────────
exports.generateDemandSheet = async (req, res) => {
  try {
    const users = await User.find({});
    const demandList = [];

    for (const user of users) {
      const rdMonthly = Number(user.monthlyRDAmount || user.monthlyRdContribution || user.rdAmount || 0);

      // Fetch all ACTIVE or APPROVED loans for this member
      const activeLoans = await Loan.find({
        memberId: user._id,
        status: { $in: ['APPROVED', 'ACTIVE'] }
      });

      let loanPrincipalDue = 0;
      let loanInterestDue  = 0;
      let loanTotalDue     = 0;
      const activeLoanIds  = [];

      for (const loan of activeLoans) {
        const emi         = Number(loan.emiAmount || loan.monthlyEMI || 0);
        const annualRate  = Number(loan.interestRate || 10) / 100;

        // Compute current outstanding from TransactionLog (live, accurate)
        const loanTxns = await TransactionLog.find({
          vendorNo: user.vendorNo,
          ledgerFolio: '152',
          status: 'COMPLETED',
          isMemoEntry: { $ne: true }
        });

        let outstanding = 0;
        loanTxns.forEach(t => {
          if (t.entryType === 'DEBIT') outstanding += t.amount;
          else if (t.entryType === 'CREDIT' && ['LOAN_REPAYMENT','LOAN_REPAYMENT_PAYROLL','CONTRA_ADJUSTMENT','LOAN_ASSET'].includes(t.category)) outstanding -= t.amount;
        });
        outstanding = Math.max(outstanding, 0);

        if (outstanding <= 0 && loan.principalPending) {
          outstanding = loan.principalPending;
        }

        if (outstanding > 0) {
          const split = splitEMI(outstanding, emi, annualRate);
          loanPrincipalDue += split.principalDue;
          loanInterestDue  += split.interestDue;
          loanTotalDue     += split.totalDue;
          activeLoanIds.push(loan.loanId);
        }
      }

      loanPrincipalDue = parseFloat(loanPrincipalDue.toFixed(2));
      loanInterestDue  = parseFloat(loanInterestDue.toFixed(2));
      loanTotalDue     = parseFloat(loanTotalDue.toFixed(2));

      if (rdMonthly > 0 || loanTotalDue > 0) {
        demandList.push({
          memberId:       user._id,
          vendorNo:       user.vendorNo || '',
          memberName:     user.name || `${user.firstName||''} ${user.lastName||''}`.trim() || 'Unknown',
          rdAmount:       rdMonthly,
          loanPrincipalDue,
          loanInterestDue,
          loanTotalDue,
          activeLoanIds,
          totalDeduction: parseFloat((rdMonthly + loanTotalDue).toFixed(2))
        });
      }
    }

    return res.status(200).json({ success: true, data: demandList, count: demandList.length });
  } catch (err) {
    console.error('generateDemandSheet Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error generating demand sheet.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/demand/create-batch
// Creates a DemandBatch from the generated demand list.
// Body: { month, year, members: [...] }
// ─────────────────────────────────────────────────────────────────────────────
exports.createDemandBatch = async (req, res) => {
  try {
    const { month, year, members } = req.body;

    if (!month || !year || !Array.isArray(members) || members.length === 0) {
      return res.status(400).json({ success: false, message: 'month, year, and members[] are required.' });
    }

    const MONTH_ABBR = month.toUpperCase().substring(0, 3);
    const batchId = `DEMAND-PAYROLL-${MONTH_ABBR}-${year}`;
    const financialYear = getFinancialYear(month, Number(year));

    // Check if batch already exists for this month/year
    const existing = await DemandBatch.findOne({ batchId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A batch for ${month} ${year} already exists (${batchId}). Status: ${existing.status}.`,
        existingBatch: { batchId: existing.batchId, status: existing.status, createdAt: existing.createdAt }
      });
    }

    // Compute totals
    let totalRDAmount = 0, totalLoanPrincipal = 0, totalLoanInterest = 0;

    const batchMembers = members.map(m => {
      const rd        = parseFloat(Number(m.rdAmount || 0).toFixed(2));
      const principal = parseFloat(Number(m.loanPrincipalDue || 0).toFixed(2));
      const interest  = parseFloat(Number(m.loanInterestDue || 0).toFixed(2));
      const loanTotal = parseFloat((principal + interest).toFixed(2));
      const total     = parseFloat((rd + loanTotal).toFixed(2));

      totalRDAmount      += rd;
      totalLoanPrincipal += principal;
      totalLoanInterest  += interest;

      return {
        memberId:         m.memberId || null,
        vendorNo:         m.vendorNo,
        memberName:       m.memberName,
        activeLoanIds:    m.activeLoanIds || [],
        rdAmount:         rd,
        loanPrincipalDue: principal,
        loanInterestDue:  interest,
        loanTotalDue:     loanTotal,
        totalDeduction:   total,
        status:           'PENDING'
      };
    });

    const totalLoanAmount = parseFloat((totalLoanPrincipal + totalLoanInterest).toFixed(2));
    const grandTotal      = parseFloat((totalRDAmount + totalLoanAmount).toFixed(2));

    const batch = new DemandBatch({
      batchId,
      purpose:           'Monthly Payroll Demand Recovery',
      month,
      year:              Number(year),
      financialYear,
      status:            'PENDING',
      totalMembers:      batchMembers.length,
      totalRDAmount:     parseFloat(totalRDAmount.toFixed(2)),
      totalLoanPrincipal: parseFloat(totalLoanPrincipal.toFixed(2)),
      totalLoanInterest:  parseFloat(totalLoanInterest.toFixed(2)),
      totalLoanAmount,
      grandTotalAmount:   grandTotal,
      unclearedTotalAmount: grandTotal,
      unclearedCount:       batchMembers.length,
      members: batchMembers
    });

    await batch.save();

    return res.status(201).json({
      success: true,
      message: `Demand Batch ${batchId} created successfully with ${batchMembers.length} members.`,
      data: {
        batchId,
        totalMembers: batchMembers.length,
        totalRDAmount: batch.totalRDAmount,
        totalLoanAmount,
        grandTotalAmount: grandTotal,
        financialYear,
        status: 'PENDING'
      }
    });
  } catch (err) {
    console.error('createDemandBatch Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error creating batch.' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demand/batches
// Returns all demand batches (summary view for clearance dashboard table)
// ─────────────────────────────────────────────────────────────────────────────
exports.getDemandBatches = async (req, res) => {
  try {
    const batches = await DemandBatch.find({}, {
      members: 0 // Exclude member details for the summary list (perf)
    }).sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: batches });
  } catch (err) {
    console.error('getDemandBatches Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/demand/batches/:batchId
// Returns a single batch WITH full member breakdown
// ─────────────────────────────────────────────────────────────────────────────
exports.getDemandBatchById = async (req, res) => {
  try {
    const batch = await DemandBatch.findOne({ batchId: req.params.batchId });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found.' });
    return res.status(200).json({ success: true, data: batch });
  } catch (err) {
    console.error('getDemandBatchById Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/demand/batches/:batchId/members/:vendorNo
// Edit a specific member's deduction amounts before clearance
// ─────────────────────────────────────────────────────────────────────────────
exports.updateBatchMember = async (req, res) => {
  try {
    const { batchId, vendorNo } = req.params;
    const { rdAmount, loanPrincipalDue, loanInterestDue, remarks } = req.body;

    const batch = await DemandBatch.findOne({ batchId });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found.' });
    if (batch.status === 'COMPLETED') return res.status(400).json({ success: false, message: 'Cannot edit a completed batch.' });

    const memberIdx = batch.members.findIndex(m => m.vendorNo === vendorNo);
    if (memberIdx === -1) return res.status(404).json({ success: false, message: 'Member not found in batch.' });

    const member = batch.members[memberIdx];
    if (member.status === 'CLEARED') return res.status(400).json({ success: false, message: 'Cannot edit an already cleared member entry.' });

    // Update fields if provided
    const oldTotal = member.totalDeduction;
    if (rdAmount       !== undefined) member.rdAmount       = parseFloat(Number(rdAmount).toFixed(2));
    if (loanPrincipalDue !== undefined) member.loanPrincipalDue = parseFloat(Number(loanPrincipalDue).toFixed(2));
    if (loanInterestDue  !== undefined) member.loanInterestDue  = parseFloat(Number(loanInterestDue).toFixed(2));
    if (remarks !== undefined) member.remarks = remarks;

    member.loanTotalDue   = parseFloat((member.loanPrincipalDue + member.loanInterestDue).toFixed(2));
    member.totalDeduction = parseFloat((member.rdAmount + member.loanTotalDue).toFixed(2));

    // Recalculate batch totals
    const delta = member.totalDeduction - oldTotal;
    batch.grandTotalAmount   = parseFloat((batch.grandTotalAmount + delta).toFixed(2));
    batch.unclearedTotalAmount = parseFloat((batch.unclearedTotalAmount + delta).toFixed(2));

    // Recompute bifurcation totals from scratch for accuracy
    let totRD = 0, totPrin = 0, totInt = 0;
    batch.members.forEach(m => {
      totRD   += m.rdAmount || 0;
      totPrin += m.loanPrincipalDue || 0;
      totInt  += m.loanInterestDue  || 0;
    });
    batch.totalRDAmount      = parseFloat(totRD.toFixed(2));
    batch.totalLoanPrincipal = parseFloat(totPrin.toFixed(2));
    batch.totalLoanInterest  = parseFloat(totInt.toFixed(2));
    batch.totalLoanAmount    = parseFloat((totPrin + totInt).toFixed(2));

    await batch.save();
    return res.status(200).json({ success: true, message: 'Member entry updated.', data: member });
  } catch (err) {
    console.error('updateBatchMember Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/demand/batches/:batchId/members/:vendorNo
// Exclude / remove a member from the batch
// ─────────────────────────────────────────────────────────────────────────────
exports.removeBatchMember = async (req, res) => {
  try {
    const { batchId, vendorNo } = req.params;

    const batch = await DemandBatch.findOne({ batchId });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found.' });
    if (batch.status === 'COMPLETED') return res.status(400).json({ success: false, message: 'Cannot modify a completed batch.' });

    const memberIdx = batch.members.findIndex(m => m.vendorNo === vendorNo);
    if (memberIdx === -1) return res.status(404).json({ success: false, message: 'Member not found in batch.' });

    const member = batch.members[memberIdx];
    if (member.status === 'CLEARED') return res.status(400).json({ success: false, message: 'Cannot remove an already cleared member entry.' });

    // Mark as EXCLUDED (soft delete — keeps audit trail)
    batch.members[memberIdx].status = 'EXCLUDED';

    // Subtract from batch totals
    batch.grandTotalAmount     = parseFloat((batch.grandTotalAmount - member.totalDeduction).toFixed(2));
    batch.unclearedTotalAmount = parseFloat((batch.unclearedTotalAmount - member.totalDeduction).toFixed(2));
    batch.totalMembers         = batch.members.filter(m => m.status !== 'EXCLUDED').length;
    batch.unclearedCount       = batch.members.filter(m => m.status === 'PENDING').length;

    await batch.save();
    return res.status(200).json({ success: true, message: `Member ${vendorNo} excluded from batch.` });
  } catch (err) {
    console.error('removeBatchMember Error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/demand/batches/:batchId/clear
// Clears selected member entries — posts individual double-entry ledger credits.
// Creates/updates a single BRS-MEMO debit entry (Folio 101, isMemoEntry: true)
// that does NOT affect financial balances — only for BRS lump-sum matching.
// Body: { vendorNos: ['VN001', 'VN002', ...] }
// ─────────────────────────────────────────────────────────────────────────────
exports.clearBatchMembers = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { vendorNos } = req.body;

    if (!Array.isArray(vendorNos) || vendorNos.length === 0) {
      return res.status(400).json({ success: false, message: 'vendorNos[] array is required.' });
    }

    const batch = await DemandBatch.findOne({ batchId });
    if (!batch) return res.status(404).json({ success: false, message: 'Batch not found.' });
    if (batch.status === 'COMPLETED') return res.status(400).json({ success: false, message: 'Batch is already fully completed.' });

    const systemUser = await User.findOne({ role: 'admin' }) || await User.findOne();
    const clearedAt = new Date();
    let totalClearedThisRound = 0;
    let clearedRDThisRound    = 0;
    let clearedLoanThisRound  = 0;
    const errors = [];
    const successVendors = [];

    for (const vendorNo of vendorNos) {
      const memberIdx = batch.members.findIndex(m => m.vendorNo === vendorNo);
      if (memberIdx === -1) { errors.push(`${vendorNo}: not found in batch`); continue; }

      const bm = batch.members[memberIdx];
      if (bm.status === 'CLEARED') { errors.push(`${vendorNo}: already cleared`); continue; }
      if (bm.status === 'EXCLUDED') { errors.push(`${vendorNo}: excluded from batch`); continue; }

      const user = await User.findOne({ vendorNo });
      if (!user) { errors.push(`${vendorNo}: member not found in database`); continue; }

      try {
        const ledgerEntries = [];
        const txIds = [];
        const memberName = bm.memberName;
        const memberId   = user._id;

        // ── CREDIT: Loan Principal → Folio 152 ──
        if (bm.loanPrincipalDue > 0) {
          const txId = `${vendorNo}-LN-PAY-${batchId}-${uuidv4().split('-')[0].toUpperCase()}`;
          ledgerEntries.push({
            vendorNo, memberName, memberId,
            ledgerFolio: '152',
            category:    'LOAN_REPAYMENT_PAYROLL',
            amount:      bm.loanPrincipalDue,
            entryType:   'CREDIT',
            paymentMode: 'LOAN_DEDUCTION',
            transactionId: txId,
            status:        'COMPLETED',
            batchId:       batchId,
            demandBatchId: batchId,
            description:   `Payroll Loan Principal Recovery - ${batch.month} ${batch.year} (${batchId})`
          });
          txIds.push(txId);
        }

        // ── CREDIT: Loan Interest → Folio 153 ──
        if (bm.loanInterestDue > 0) {
          const txId = `${vendorNo}-INT-PAY-${batchId}-${uuidv4().split('-')[0].toUpperCase()}`;
          ledgerEntries.push({
            vendorNo, memberName, memberId,
            ledgerFolio: '153',
            category:    'INTEREST_INCOME_PAYROLL',
            amount:      bm.loanInterestDue,
            entryType:   'CREDIT',
            paymentMode: 'LOAN_DEDUCTION',
            transactionId: txId,
            status:        'COMPLETED',
            batchId:       batchId,
            demandBatchId: batchId,
            description:   `Payroll Loan Interest Recovery - ${batch.month} ${batch.year} (${batchId})`
          });
          txIds.push(txId);
        }

        // ── CREDIT: RD Amount → Folio 154 ──
        if (bm.rdAmount > 0) {
          const txId = `${vendorNo}-RD-PAY-${batchId}-${uuidv4().split('-')[0].toUpperCase()}`;
          ledgerEntries.push({
            vendorNo, memberName, memberId,
            ledgerFolio: '154',
            category:    'RD_DEPOSIT_PAYROLL',
            amount:      bm.rdAmount,
            entryType:   'CREDIT',
            paymentMode: 'LOAN_DEDUCTION',
            transactionId: txId,
            status:        'COMPLETED',
            batchId:       batchId,
            demandBatchId: batchId,
            description:   `Payroll RD Recovery - ${batch.month} ${batch.year} (${batchId})`
          });
          txIds.push(txId);
        }

        // Save individual ledger entries (these ARE the financial entries)
        for (const entry of ledgerEntries) {
          await new TransactionLog(entry).save();
        }

        // ── Update User balances ──
        if (bm.rdAmount > 0) {
          user.rdBalance = parseFloat(((user.rdBalance || 0) + bm.rdAmount).toFixed(2));
        }
        if (bm.loanPrincipalDue > 0) {
          user.pendingLoanBalance = parseFloat(Math.max((user.pendingLoanBalance || 0) - bm.loanPrincipalDue, 0).toFixed(2));
        }
        await user.save();

        // ── Check if any active loans should be closed ──
        if (bm.loanPrincipalDue > 0) {
          const activeLoans = await Loan.find({ memberId: user._id, status: { $in: ['APPROVED', 'ACTIVE'] } });
          for (const loan of activeLoans) {
            const loanTxns = await TransactionLog.find({
              vendorNo, ledgerFolio: '152', status: 'COMPLETED', isMemoEntry: { $ne: true }
            });
            let outstanding = 0;
            loanTxns.forEach(t => {
              if (t.entryType === 'DEBIT') outstanding += t.amount;
              else if (['LOAN_REPAYMENT','LOAN_REPAYMENT_PAYROLL','CONTRA_ADJUSTMENT','LOAN_ASSET'].includes(t.category)) outstanding -= t.amount;
            });
            if (outstanding <= 0) {
              loan.status = 'CLOSED';
              await loan.save();
            }
          }
        }

        // ── Mark member as CLEARED in batch ──
        batch.members[memberIdx].status               = 'CLEARED';
        batch.members[memberIdx].clearedAt             = clearedAt;
        batch.members[memberIdx].clearedTransactionIds = txIds;

        totalClearedThisRound += bm.totalDeduction;
        clearedRDThisRound    += bm.rdAmount;
        clearedLoanThisRound  += bm.loanTotalDue;
        successVendors.push(vendorNo);

      } catch (memberErr) {
        console.error(`clearBatchMembers error for ${vendorNo}:`, memberErr.message);
        errors.push(`${vendorNo}: ${memberErr.message}`);
      }
    }

    // ── Update batch aggregate totals ──
    batch.clearedTotalAmount  = parseFloat((batch.clearedTotalAmount  + totalClearedThisRound).toFixed(2));
    batch.clearedRDAmount     = parseFloat((batch.clearedRDAmount     + clearedRDThisRound).toFixed(2));
    batch.clearedLoanAmount   = parseFloat((batch.clearedLoanAmount   + clearedLoanThisRound).toFixed(2));
    batch.clearedCount        = batch.members.filter(m => m.status === 'CLEARED').length;
    batch.unclearedCount      = batch.members.filter(m => m.status === 'PENDING').length;
    batch.unclearedTotalAmount = parseFloat(
      batch.members.filter(m => m.status === 'PENDING').reduce((s, m) => s + m.totalDeduction, 0).toFixed(2)
    );

    // ── Determine batch status ──
    if (batch.unclearedCount === 0) {
      batch.status = 'COMPLETED';
    } else if (batch.clearedCount > 0) {
      batch.status = 'PARTIALLY_CLEARED';
    }

    // ── BRS MEMO ENTRY: single clubbed Folio 101 debit (isMemoEntry: true) ──
    // This entry is purely for BRS lump-sum matching with the employer payroll deposit.
    // It does NOT affect any financial balance or appear in Trial Balance / P&L.
    if (totalClearedThisRound > 0) {
      if (batch.memoTransactionId) {
        // Update existing memo entry amount (cumulative cleared amount)
        await TransactionLog.findOneAndUpdate(
          { transactionId: batch.memoTransactionId },
          { $set: { amount: batch.clearedTotalAmount, description: `[BRS-MEMO] Payroll Recovery Batch ${batchId} - ${batch.month} ${batch.year} | Cleared: ${batch.clearedCount}/${batch.totalMembers} members | ₹${batch.clearedTotalAmount}` } }
        );
      } else {
        // Create the first memo entry
        const memoTxId = `SYS-BRS-MEMO-${batchId}`;
        const memoEntry = new TransactionLog({
          vendorNo:       'SYS-PAYROLL',
          memberName:     `HPSEBL Payroll Recovery - ${batch.month} ${batch.year}`,
          memberId:       systemUser ? systemUser._id : null,
          ledgerFolio:    '101',
          category:       'PAYROLL_BATCH_MEMO',
          amount:         batch.clearedTotalAmount,
          entryType:      'DEBIT',
          paymentMode:    'BANK_TRANSFER',
          transactionId:  memoTxId,
          status:         'PENDING_VERIFICATION', // BRS will match against this
          batchId:        batchId,
          demandBatchId:  batchId,
          isMemoEntry:    true, // FLAG: excluded from all financial balance calculations
          description:    `[BRS-MEMO] Payroll Recovery Batch ${batchId} - ${batch.month} ${batch.year} | Cleared: ${batch.clearedCount}/${batch.totalMembers} members | ₹${batch.clearedTotalAmount}`
        });
        await memoEntry.save();
        batch.memoTransactionId = memoTxId;
      }
    }

    await batch.save();

    return res.status(200).json({
      success: true,
      message: `Cleared ${successVendors.length} member(s). ₹${totalClearedThisRound.toFixed(2)} posted to ledger.${errors.length > 0 ? ` ${errors.length} error(s): ${errors.join('; ')}` : ''}`,
      data: {
        cleared:             successVendors,
        errors,
        batchStatus:         batch.status,
        clearedCount:        batch.clearedCount,
        unclearedCount:      batch.unclearedCount,
        clearedTotalAmount:  batch.clearedTotalAmount,
        unclearedTotalAmount: batch.unclearedTotalAmount,
        memoTransactionId:   batch.memoTransactionId
      }
    });
  } catch (err) {
    console.error('clearBatchMembers Error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Server error during clearance.' });
  }
};
