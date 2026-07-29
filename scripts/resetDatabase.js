// scripts/resetDatabase.js
require('dotenv').config();
const mongoose = require('mongoose');

// Import your models
const User = require('../models/User');
const Loan = require('../models/Loan');
const TransactionLog = require('../models/TransactionLog');

// ==========================================
// ⚙️ WIPE CONFIGURATION SETTINGS
// ==========================================
const CONFIG = {
  // Set to 'true' to completely wipe ALL test data (except Admin). 
  // Set to 'false' to safely use the Date Filters below.
  wipeEverything: false,         
  
  // Options: 'BEFORE' (older than) or 'AFTER' (newer than)
  dateCondition: 'AFTER',        
  
  // The exact target date (Format: YYYY-MM-DD)
  targetDate: '2026-07-28' 
};
// ==========================================

const cleanDatabase = async () => {
  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected successfully.');

    if (process.env.NODE_ENV === 'production') {
        console.error('❌ DANGER: You are trying to wipe the production database! Aborting.');
        process.exit(1);
    }

    // --- 1. Construct the Date Query Logic ---
    let userAndLoanQuery = {};
    let transactionQuery = {};

    if (!CONFIG.wipeEverything) {
      const targetDateObj = new Date(CONFIG.targetDate);
      const operator = CONFIG.dateCondition === 'AFTER' ? '$gte' : '$lt'; // $gte = Greater Than/Equal, $lt = Less Than
      
      console.log(`⏳ Mode: Deleting records created ${CONFIG.dateCondition} ${CONFIG.targetDate}...`);
      
      // Assumes User and Loan models have standard Mongoose { timestamps: true }
      userAndLoanQuery = { createdAt: { [operator]: targetDateObj } };
      
      // Transactions specifically use 'transactionDate' based on our controller logic
      transactionQuery = { transactionDate: { [operator]: targetDateObj } };
    } else {
      console.log(`⚠️ Mode: TOTAL WIPE (Deleting ALL records)...`);
    }

    // --- 2. Execute the Deletions ---
    console.log('🗑️ Cleaning Transaction Logs...');
    const deletedTxns = await TransactionLog.deleteMany(transactionQuery);
    console.log(`   -> Deleted ${deletedTxns.deletedCount} transactions.`);
    
    console.log('🗑️ Cleaning Loan Applications...');
    const deletedLoans = await Loan.deleteMany(userAndLoanQuery);
    console.log(`   -> Deleted ${deletedLoans.deletedCount} loans.`);

    console.log('🗑️ Cleaning Test Members...');
    // We strictly protect the Admin account so you don't lock yourself out!
    const userDeleteQuery = CONFIG.wipeEverything 
      ? { role: { $ne: 'admin' } } 
      : { role: { $ne: 'admin' }, ...userAndLoanQuery };
      
    const deletedUsers = await User.deleteMany(userDeleteQuery);
    console.log(`   -> Deleted ${deletedUsers.deletedCount} test members.`);

    console.log('🚀 SUCCESS: Database cleanup complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
    process.exit(1);
  }
};

cleanDatabase();