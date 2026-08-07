// controllers/correctionController.js
// Correction Manager — Handles Transaction Reversal, Edit, and immutable Event Log
// All actions require: admin role + password re-confirmation + reason

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const TransactionLog = require('../models/TransactionLog');
const EventLog = require('../models/EventLog');
const User = require('../models/User');

// ============================================================
// SHARED HELPER — Calculate member balance (excludes REVERSED)
// ============================================================
const getMemberBalance = async (vendorNo) => {
  const transactions = await TransactionLog.find({
    vendorNo,
    status: { $ne: 'REVERSED' },
    category: { $ne: 'REVERSAL' }
  });

  let balance = 0;
  transactions.forEach(trx => {
    if (trx.ledgerFolio === '152') return; // Skip loan entries from general balance
    const amount = Number(trx.amount || 0);
    if (trx.entryType === 'CREDIT') balance += amount;
    else if (trx.entryType === 'DEBIT') balance -= amount;
  });
  return balance;
};

// ============================================================
// SHARED HELPER — Verify admin identity & password
// ============================================================
const verifyAdminPassword = async (adminId, password) => {
  const admin = await User.findById(adminId).select('+password');
  if (!admin) throw new Error('Admin account not found.');
  if (admin.role !== 'admin') throw new Error('Access denied. Admin role required.');
  const isMatch = await bcrypt.compare(password, admin.password);
  if (!isMatch) throw new Error('Incorrect admin password. Reversal cancelled.');
  return admin;
};

// ============================================================
// 1. SEARCH TRANSACTIONS (for the Find & Correct tab)
// ============================================================
exports.searchForCorrection = async (req, res) => {
  try {
    const { vendorNo, transactionId, startDate, endDate, category, showReversed } = req.query;

    const query = {};

    // Exclude pure reversal counter-entries from the search (they can never be actioned)
    if (!showReversed) {
      query.category = { $ne: 'REVERSAL' };
    }

    if (vendorNo) query.vendorNo = { $regex: vendorNo.trim(), $options: 'i' };
    if (transactionId) query.transactionId = { $regex: transactionId.trim(), $options: 'i' };
    if (category && category !== 'ALL') query.category = category;

    if (startDate || endDate) {
      query.transactionDate = {};
      if (startDate) query.transactionDate.$gte = new Date(startDate);
      if (endDate) query.transactionDate.$lte = new Date(`${endDate}T23:59:59`);
    }

    const transactions = await TransactionLog.find(query)
      .sort({ transactionDate: -1 })
      .limit(100);

    res.json({ success: true, data: transactions });
  } catch (error) {
    console.error('Correction Search Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================
// 2. REVERSE TRANSACTION
// ============================================================
exports.reverseTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { txId } = req.params;
    const { reason, adminPassword } = req.body;
    const adminId = req.user.id;

    // Validation
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'A reason of at least 5 characters is required.' });
    }
    if (!adminPassword) {
      return res.status(400).json({ success: false, message: 'Admin password is required to confirm this action.' });
    }

    // Verify admin password
    const admin = await verifyAdminPassword(adminId, adminPassword);

    // Find original transaction
    const original = await TransactionLog.findOne({ transactionId: txId }).session(session);
    if (!original) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: `Transaction not found: ${txId}` });
    }

    // Guard: already reversed?
    if (original.status === 'REVERSED') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'This transaction has already been reversed.' });
    }

    // Guard: is this itself a reversal counter-entry?
    if (original.category === 'REVERSAL') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'A reversal entry cannot itself be reversed.' });
    }

    // Capture balance BEFORE reversal
    const balanceBefore = await getMemberBalance(original.vendorNo);

    // Take a full snapshot of the original before modifying it
    const snapshot = original.toObject();

    // Create the counter-entry (opposite entry type)
    const counterEntry = new TransactionLog({
      vendorNo:         original.vendorNo,
      memberName:       original.memberName,
      ledgerFolio:      original.ledgerFolio,
      memberId:         original.memberId,
      category:         'REVERSAL',
      amount:           original.amount,
      entryType:        original.entryType === 'CREDIT' ? 'DEBIT' : 'CREDIT',
      paymentMode:      'INTERNAL_TRANSFER',
      transactionDate:  new Date(),
      description:      `REVERSAL of ${original.transactionId} — ${reason.trim()}`,
      status:           'COMPLETED',
      batchId:          `REV-${original.transactionId}`,
      reversalOf:       original._id,
      reversalReason:   reason.trim(),
      relatedLoanId:    original.relatedLoanId || null
    });
    await counterEntry.save({ session });

    // Mark original as REVERSED
    original.status = 'REVERSED';
    original.reversedById = counterEntry._id;
    original.reversalReason = reason.trim();
    await original.save({ session });

    // Capture balance AFTER reversal
    const balanceAfter = await getMemberBalance(original.vendorNo);

    // Write the immutable EventLog record
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await EventLog.create([{
      eventType: 'REVERSAL',
      performedBy: {
        adminId:       admin._id,
        adminName:     admin.name,
        adminVendorNo: admin.vendorNo
      },
      ipAddress,
      targetTransactionId:       original.transactionId,
      originalSnapshot:          snapshot,
      affectedVendorNo:          original.vendorNo,
      affectedMemberName:        original.memberName,
      counterEntryTransactionId: counterEntry.transactionId,
      memberBalanceBefore:       balanceBefore,
      memberBalanceAfter:        balanceAfter,
      reason: reason.trim()
    }], { session });

    // Commit all three writes atomically
    await session.commitTransaction();

    res.json({
      success: true,
      message: `Transaction ${original.transactionId} has been reversed successfully.`,
      data: {
        originalTransactionId: original.transactionId,
        counterEntryId:        counterEntry.transactionId,
        balanceBefore,
        balanceAfter
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Reversal Error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// ============================================================
// 3. EDIT TRANSACTION (safe fields only)
// ============================================================

// Fields that are safe to edit — amount/entryType/category are intentionally excluded
const EDITABLE_FIELDS = ['description', 'paymentMode', 'transactionReference', 'transactionDate', 'ledgerFolio', 'batchId', 'memberName'];
const LOCKED_FIELDS   = ['amount', 'entryType', 'category', 'vendorNo', 'memberId'];

exports.editTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { txId } = req.params;
    const { changes, reason, adminPassword } = req.body;
    const adminId = req.user.id;

    // Validation
    if (!reason || reason.trim().length < 5) {
      return res.status(400).json({ success: false, message: 'A reason of at least 5 characters is required.' });
    }
    if (!adminPassword) {
      return res.status(400).json({ success: false, message: 'Admin password is required to confirm this action.' });
    }
    if (!changes || Object.keys(changes).length === 0) {
      return res.status(400).json({ success: false, message: 'No changes provided.' });
    }

    // Check for locked field violations
    const lockedAttempts = Object.keys(changes).filter(f => LOCKED_FIELDS.includes(f));
    if (lockedAttempts.length > 0) {
      return res.status(400).json({
        success: false,
        message: `The field(s) [${lockedAttempts.join(', ')}] affect account balance and cannot be edited directly. Please use Reversal for these corrections.`
      });
    }

    // Check only whitelisted fields
    const invalidFields = Object.keys(changes).filter(f => !EDITABLE_FIELDS.includes(f));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Field(s) [${invalidFields.join(', ')}] are not editable.`
      });
    }

    // Verify admin password
    const admin = await verifyAdminPassword(adminId, adminPassword);

    // Find original transaction
    const original = await TransactionLog.findOne({ transactionId: txId }).session(session);
    if (!original) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: `Transaction not found: ${txId}` });
    }

    // Guards
    if (original.status === 'REVERSED') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'A reversed transaction cannot be edited.' });
    }
    if (original.category === 'REVERSAL') {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'A reversal counter-entry cannot be edited.' });
    }

    // Capture full snapshot and field-level diff
    const snapshot = original.toObject();
    const fieldChanges = [];

    Object.entries(changes).forEach(([field, newValue]) => {
      const oldValue = original[field];
      if (String(oldValue) !== String(newValue)) {
        fieldChanges.push({ field, oldValue, newValue });
        original[field] = newValue;
      }
    });

    if (fieldChanges.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'No actual changes detected. All submitted values are identical to current values.' });
    }

    await original.save({ session });

    // Write EventLog
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    await EventLog.create([{
      eventType: 'EDIT',
      performedBy: {
        adminId:       admin._id,
        adminName:     admin.name,
        adminVendorNo: admin.vendorNo
      },
      ipAddress,
      targetTransactionId: original.transactionId,
      originalSnapshot:    snapshot,
      affectedVendorNo:    original.vendorNo,
      affectedMemberName:  original.memberName,
      fieldChanges,
      reason: reason.trim()
    }], { session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: `Transaction ${original.transactionId} has been updated. ${fieldChanges.length} field(s) changed.`,
      data: { transactionId: original.transactionId, fieldChanges }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Edit Transaction Error:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// ============================================================
// 4. GET EVENT LOG (paginated, filterable — read-only)
// ============================================================
exports.getEventLog = async (req, res) => {
  try {
    const { page = 1, limit = 50, eventType, vendorNo, adminName, startDate, endDate } = req.query;

    const query = {};
    if (eventType && eventType !== 'ALL') query.eventType = eventType;
    if (vendorNo) query.affectedVendorNo = { $regex: vendorNo.trim(), $options: 'i' };
    if (adminName) query['performedBy.adminName'] = { $regex: adminName.trim(), $options: 'i' };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(`${endDate}T23:59:59`);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [events, total] = await Promise.all([
      EventLog.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      EventLog.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Event Log Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
