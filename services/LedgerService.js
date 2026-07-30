// services/LedgerService.js
const mongoose = require('mongoose');
// Import your central transaction model (ensure this matches your actual model name)
const TransactionLog = require('../models/TransactionLog'); 

class LedgerService {
  
  /**
   * THE ENFORCER: Validates and executes a double-entry transaction.
   * Enforces the rule: $Total Debits = Total Credits$
   */
  static async executeDoubleEntry(entries, description, session = null) {
    let totalDebits = 0;
    let totalCredits = 0;

    // 1. Calculate totals
    entries.forEach(entry => {
      if (entry.entryType === 'DEBIT') totalDebits += entry.amount;
      if (entry.entryType === 'CREDIT') totalCredits += entry.amount;
    });

    // JavaScript floating point fix (e.g., 0.1 + 0.2 !== 0.3)
    totalDebits = Math.round(totalDebits * 100) / 100;
    totalCredits = Math.round(totalCredits * 100) / 100;

    // 2. The Strict Barrier
    if (totalDebits !== totalCredits) {
      throw new Error(`Ledger Imbalance Rejected: Debits (₹${totalDebits}) do not match Credits (₹${totalCredits}).`);
    }

    // 3. Save to Database (Using MongoDB ACID Transactions if possible)
    const savedEntries = [];
    for (const entry of entries) {
      const newLedgerEntry = new TransactionLog({
        ...entry,
        description,
        status: 'COMPLETED',
        transactionDate: new Date()
      });
      
      const saved = await newLedgerEntry.save({ session });
      savedEntries.push(saved);
    }

    return savedEntries;
  }

  /**
   * THE ROUTER: Processes an inward payment from a member.
   * Handles the Waterfall Effect toggle and Suspense routing.
   */
  static async processMemberPayment({ 
    memberId, 
    vendorNo, 
    totalReceived, 
    loanDues = { principal: 0, interest: 0 }, 
    rdDue = 0, 
    applyWaterfall = true,
    explicitAllocations = { loanPrincipal: 0, loanInterest: 0, rdAmount: 0 }
  }) {
    
    let remainingAmount = totalReceived;
    const ledgerEntries = [];

    // --- STEP 1: LOG THE BANK DEBIT (Money entering the Sacco) ---
    ledgerEntries.push({
      memberId, vendorNo,
      folio: '101', category: 'Cash_at_Bank',
      entryType: 'DEBIT',
      amount: totalReceived
    });

    // --- STEP 2: ALLOCATE FUNDS (Waterfall ON vs OFF) ---
    let allocPrincipal = 0;
    let allocInterest = 0;
    let allocRD = 0;

    if (applyWaterfall) {
      // Priority 1: Loan Interest (Always paid first in standard banking)
      if (remainingAmount >= loanDues.interest) {
        allocInterest = loanDues.interest;
        remainingAmount -= allocInterest;
      } else {
        allocInterest = remainingAmount;
        remainingAmount = 0;
      }

      // Priority 2: Loan Principal
      if (remainingAmount >= loanDues.principal) {
        allocPrincipal = loanDues.principal;
        remainingAmount -= allocPrincipal;
      } else {
        allocPrincipal = remainingAmount;
        remainingAmount = 0;
      }

      // Priority 3: Recurring Deposit (RD)
      if (remainingAmount >= rdDue) {
        allocRD = rdDue;
        remainingAmount -= allocRD;
      } else {
        allocRD = remainingAmount;
        remainingAmount = 0;
      }
    } else {
      // Waterfall OFF: Use strictly what was passed from the Excel/Manual Input
      allocPrincipal = explicitAllocations.loanPrincipal || 0;
      allocInterest = explicitAllocations.loanInterest || 0;
      allocRD = explicitAllocations.rdAmount || 0;
      
      remainingAmount = totalReceived - (allocPrincipal + allocInterest + allocRD);
    }

    // --- STEP 3: CREATE THE CREDIT ENTRIES ---
    
    if (allocInterest > 0) {
      ledgerEntries.push({
        memberId, vendorNo,
        folio: '153', category: 'Interest_Income',
        entryType: 'CREDIT', amount: allocInterest
      });
    }

    if (allocPrincipal > 0) {
      ledgerEntries.push({
        memberId, vendorNo,
        folio: '152', category: 'Loan_Asset',
        entryType: 'CREDIT', amount: allocPrincipal
      });
    }

    if (allocRD > 0) {
      ledgerEntries.push({
        memberId, vendorNo,
        folio: '154', category: 'RD_Liability',
        entryType: 'CREDIT', amount: allocRD
      });
    }

    // --- STEP 4: CATCH THE LEFTOVERS (Suspense / Overflow) ---
    // If the member overpaid (or if Waterfall was OFF and numbers didn't match)
    if (remainingAmount > 0) {
      ledgerEntries.push({
        memberId, vendorNo,
        folio: '999', category: 'Suspense_Clearing',
        entryType: 'CREDIT', amount: remainingAmount
      });
    }

    // Ensure we don't accidentally have negative leftovers
    if (remainingAmount < 0) {
      throw new Error("Explicit allocations exceed the total amount received.");
    }

    // --- STEP 5: PUSH TO THE ENFORCER ---
    const description = applyWaterfall 
      ? `Auto-Waterfall Allocation for Vendor ${vendorNo}` 
      : `Manual Allocation for Vendor ${vendorNo}`;
      
    return await this.executeDoubleEntry(ledgerEntries, description);
  }
}

module.exports = LedgerService;