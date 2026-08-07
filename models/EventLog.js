const mongoose = require('mongoose');

// ============================================================
// EVENT LOG — Immutable audit trail for all corrections
// This collection is APPEND-ONLY. No delete route is ever created.
// ============================================================
const eventLogSchema = new mongoose.Schema({

  // What kind of correction was made
  eventType: {
    type: String,
    required: true,
    enum: ['REVERSAL', 'EDIT', 'SYSTEM_INIT', 'BULK_UPLOAD']
  },

  // Who performed it
  performedBy: {
    adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    adminName:    { type: String, required: true },
    adminVendorNo:{ type: String, required: true }
  },

  // Network identity
  ipAddress: {
    type: String,
    default: 'unknown'
  },

  // The original transaction being acted on
  targetTransactionId: {
    type: String,
    required: true
  },

  // Full copy of the original transaction at the moment of correction
  // This is a frozen snapshot — it never changes
  originalSnapshot: {
    type: Object,
    required: true
  },

  // Affected member info (denormalised for fast log display)
  affectedVendorNo:   { type: String, default: null },
  affectedMemberName: { type: String, default: null },

  // ── REVERSAL-specific fields ──
  counterEntryTransactionId: { type: String, default: null },
  memberBalanceBefore:       { type: Number, default: null },
  memberBalanceAfter:        { type: Number, default: null },

  // ── EDIT-specific fields ──
  // Array of { field, oldValue, newValue } objects
  fieldChanges: {
    type: [
      {
        field:    { type: String },
        oldValue: { type: mongoose.Schema.Types.Mixed },
        newValue: { type: mongoose.Schema.Types.Mixed }
      }
    ],
    default: []
  },

  // Reason is always required — enforced in the controller
  reason: {
    type: String,
    required: true,
    minlength: [5, 'Reason must be at least 5 characters']
  }

}, {
  timestamps: true,       // createdAt is the immutable timestamp
  versionKey: false
});

// Index for fast lookups in the Event Log viewer
eventLogSchema.index({ targetTransactionId: 1 });
eventLogSchema.index({ affectedVendorNo: 1 });
eventLogSchema.index({ 'performedBy.adminId': 1 });
eventLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EventLog', eventLogSchema);
