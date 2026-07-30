// services/LedgerService.js
const mongoose = require('mongoose');
const TransactionLog = require('../models/TransactionLog'); 

class LedgerService {
  
  static async executeDoubleEntry(entries, description, session = null) {
    let totalDebits = 0;
    let totalCredits = 0;

    entries.forEach(entry => {
      if (entry.entryType === 'DEBIT') totalDebits += entry.amount;
      if (entry.entryType === 'CREDIT') totalCredits += entry.amount;
    });

    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;

    if (totalDebits !== totalCredits) {
      throw new Error(`Ledger Imbalance Rejected: Debits (₹${totalDebits}) do not match Credits (₹${totalCredits}).`);
    }

    const savedEntries = [];
    for (const entry of entries) {
      const newLedgerEntry = new TransactionLog({
        ...entry,
        description,
        status: entry.status || 'COMPLETED',
        transactionDate: entry.transactionDate || new Date()
      });
      
      const saved = await newLedgerEntry.save({ session });
      savedEntries.push(saved);
    }

    return savedEntries;
  }

  static async processMemberPayment({ 
    memberId, vendorNo, memberName, totalReceived, 
    loanDues = { principal: 0, interest: 0 }, rdDue = 0, applyWaterfall = true,
    explicitAllocations = { loanPrincipal: 0, loanInterest: 0, rdAmount: 0 }
  }) {
    
    let remainingAmount = totalReceived;
    const ledgerEntries = [];

    // STEP 1: DEBIT (Money in Bank)
    ledgerEntries.push({
      memberId, vendorNo, memberName,
      ledgerFolio: '101', category: 'BANK_RECEIPT',
      entryType: 'DEBIT', amount: totalReceived
    });

    let allocPrincipal = 0;
    let allocInterest = 0;
    let allocRD = 0;

    if (applyWaterfall) {
      if (remainingAmount >= loanDues.interest) {
        allocInterest = loanDues.interest;
        remainingAmount -= allocInterest;
      } else { allocInterest = remainingAmount; remainingAmount = 0; }

      if (remainingAmount >= loanDues.principal) {
        allocPrincipal = loanDues.principal;
        remainingAmount -= allocPrincipal;
      } else { allocPrincipal = remainingAmount; remainingAmount = 0; }

      if (remainingAmount >= rdDue) {
        allocRD = rdDue;
        remainingAmount -= allocRD;
      } else { allocRD = remainingAmount; remainingAmount = 0; }
    } else {
      allocPrincipal = explicitAllocations.loanPrincipal || 0;
      allocInterest = explicitAllocations.loanInterest || 0;
      allocRD = explicitAllocations.rdAmount || 0;
      remainingAmount = totalReceived - (allocPrincipal + allocInterest + allocRD);
    }

    // STEP 3: CREDIT ENTRIES
    if (allocInterest > 0) {
      ledgerEntries.push({
        memberId, vendorNo, memberName,
        ledgerFolio: '153', category: 'INTEREST_INCOME',
        entryType: 'CREDIT', amount: allocInterest
      });
    }

    if (allocPrincipal > 0) {
      ledgerEntries.push({
        memberId, vendorNo, memberName,
        ledgerFolio: '152', category: 'LOAN_ASSET',
        entryType: 'CREDIT', amount: allocPrincipal
      });
    }

    if (allocRD > 0) {
      ledgerEntries.push({
        memberId, vendorNo, memberName,
        ledgerFolio: '154', category: 'RD_LIABILITY',
        entryType: 'CREDIT', amount: allocRD
      });
    }

    // STEP 4: SUSPENSE
    if (remainingAmount > 0) {
      ledgerEntries.push({
        memberId, vendorNo, memberName,
        ledgerFolio: '999', category: 'SUSPENSE_CLEARING',
        entryType: 'CREDIT', amount: remainingAmount
      });
    }

    if (remainingAmount < 0) {
      throw new Error("Explicit allocations exceed the total amount received.");
    }

    const description = applyWaterfall 
      ? `Auto-Waterfall Allocation for Vendor ${vendorNo}` 
      : `Manual Allocation for Vendor ${vendorNo}`;
      
    return await this.executeDoubleEntry(ledgerEntries, description);
  }
}

module.exports = LedgerService;