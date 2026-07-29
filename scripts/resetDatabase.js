// scripts/resetDatabase.js
require('dotenv').config();
const mongoose = require('mongoose');

// Import your models
const User = require('../models/User');
const Loan = require('../models/Loan');
const TransactionLog = require('../models/TransactionLog');

const cleanDatabase = async () => {
  try {
    // 1. Connect to MongoDB Atlas using your existing URI
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected successfully.');

    // 2. SAFETY LOCK (Optional but recommended)
    // If you ever accidentally run this in production, this stops it.
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ DANGER: You are trying to wipe the production database! Aborting.');
        process.exit(1);
    }

    // 3. Wipe the Financial Ledgers Completely
    console.log('🗑️ Wiping Transaction Logs...');
    await TransactionLog.deleteMany({});
    
    console.log('🗑️ Wiping Loan Applications...');
    await Loan.deleteMany({});

    // 4. Wipe Users (Except Admins)
    // This wipes all test members but keeps your Admin account so you can still log in!
    console.log('🗑️ Wiping Test Members...');
    await User.deleteMany({ role: { $ne: 'admin' } }); 

    console.log('🚀 SUCCESS: Database is clean and ready for production launch!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
    process.exit(1);
  }
};

cleanDatabase();