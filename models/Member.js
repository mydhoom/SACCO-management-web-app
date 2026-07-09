const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  vendorNo: { type: String, required: true, unique: true }, // Replaced email with vendorNo
  password: { type: String, required: true }, // Added password vault
  phone: { type: String, required: true },
  dateJoined: { type: Date, default: Date.now },
  active: { type: Boolean, default: true },
});

module.exports = mongoose.model("Member", memberSchema);
