// models/CommunicationThread.js
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  senderId:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  senderName:     { type: String, required: true },
  senderRole:     { type: String, enum: ["member","admin","executive"], required: true },
  content:        { type: String, required: true },
  attachmentUrl:  { type: String, default: null },
  attachmentName: { type: String, default: null },
  attachmentType: { type: String, default: null },
  readByAdmin:    { type: Boolean, default: false },
  readByMember:   { type: Boolean, default: false },
  createdAt:      { type: Date, default: Date.now }
}, { _id: true });

const communicationThreadSchema = new mongoose.Schema({
  ticketId:   { type: String, unique: true, index: true },
  memberId:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  vendorNo:   { type: String, required: true },
  memberName: { type: String, required: true },
  subject:    { type: String, required: true },
  category: {
    type: String,
    enum: ["LOAN_QUERY","RD_QUERY","DEMAND_RECOVERY","PASSBOOK_QUERY","KYC_UPDATE","SHARE_CAPITAL","WITHDRAWAL_REQUEST","GENERAL_INQUIRY","COMPLAINT","OTHER"],
    default: "GENERAL_INQUIRY"
  },
  priority: { type: String, enum: ["LOW","NORMAL","HIGH","URGENT"], default: "NORMAL" },
  status:   { type: String, enum: ["OPEN","IN_PROGRESS","AWAITING_MEMBER","RESOLVED","CLOSED"], default: "OPEN" },
  messages:  [messageSchema],
  unreadByAdmin:      { type: Number, default: 0 },
  unreadByMember:     { type: Number, default: 0 },
  lastMessageAt:      { type: Date, default: Date.now },
  lastMessageSnippet: { type: String, default: "" },
  assignedTo: { type: String, default: null },
  resolvedAt: { type: Date, default: null },
  resolvedBy: { type: String, default: null }
}, { timestamps: true });

communicationThreadSchema.pre("validate", async function(next) {
  if (this.isNew && (!this.ticketId || this.ticketId === "__auto__")) {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments();
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.ticketId = `TKT-${year}-${String(count + 1).padStart(4, "0")}-${rand}`;
  }
  next();
});

communicationThreadSchema.index({ memberId: 1, status: 1 });
communicationThreadSchema.index({ status: 1, lastMessageAt: -1 });

module.exports = mongoose.model("CommunicationThread", communicationThreadSchema);
