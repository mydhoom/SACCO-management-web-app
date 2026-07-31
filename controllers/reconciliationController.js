const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const { Groq } = require('groq-sdk');
const { GoogleGenAI } = require('@google/genai');
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User');
const LedgerService = require('../services/LedgerService'); 

// 1. Initialize API Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper to safely extract JSON from Gemini Output
const extractCleanJSON = (text) => {
  try {
    const jsonStart = text.indexOf('[');
    const jsonEnd = text.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
    }
    return JSON.parse(text);
  } catch (error) {
    return [];
  }
};

// ==========================================
// TWO-TIER MATCHING LOGIC (1-to-1 & 1-to-Many)
// ==========================================
async function findInternalMatch(depositAmount, bankDate, aiModelName = "Local Engine") {
  const amount = Number(depositAmount);
  
  // Tier 1: Direct 1-to-1 Match
  const singleMatch = await TransactionLog.findOne({
    amount: amount,
    status: 'PENDING_VERIFICATION',
    entryType: 'DEBIT'
  }).populate('memberId', 'name vendorNo');

  if (singleMatch) {
    return {
      systemTransactionId: singleMatch.transactionId,
      member: singleMatch.memberId ? singleMatch.memberId.name : 'Unknown',
      confidence: `HIGH - Single Match (${aiModelName})`
    };
  }

  // Tier 2: Batch / Clubbed Match (1-to-Many)
  // Reconstruct bank date carefully for window comparison
  // Handles typical Indian bank date formats (DD/MM/YYYY)
  let dDate;
  if (bankDate.includes('/')) {
    const [day, month, year] = bankDate.split('/');
    dDate = new Date(`${year}-${month}-${day}`);
  } else {
    dDate = new Date(bankDate);
  }

  const pendingBatches = await TransactionLog.aggregate([
    { $match: { status: 'PENDING_VERIFICATION', batchId: { $ne: null } } },
    { 
      $group: { 
        _id: "$batchId", 
        totalAmount: { $sum: "$amount" }, 
        batchDate: { $min: "$createdAt" },
        count: { $sum: 1 }
      } 
    },
    { $match: { totalAmount: amount } }
  ]);

  const validBatchMatch = pendingBatches.find(batch => {
    const uploadDate = new Date(batch.batchDate);
    const windowEnd = new Date(uploadDate);
    windowEnd.setDate(windowEnd.getDate() + 4); // 4-Day Window Logic

    return dDate >= uploadDate && dDate <= windowEnd;
  });

  if (validBatchMatch) {
    return {
      systemTransactionId: validBatchMatch._id, // Returns e.g. HO01-20260730-F101
      member: `Batch of ${validBatchMatch.count} Payments`,
      confidence: `HIGH - Batch Match [1-to-4 Day Window] (${aiModelName})`
    };
  }

  return null; // No match found -> goes to Suspense
}

// ==========================================
// UPLOAD & ROUTING CONTROLLER
// ==========================================
const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // ==========================================
      // NEW: DYNAMIC HEADER SCANNER
      // ==========================================
      // 1. Read the sheet as a raw 2D array to find where the table actually starts
      const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
      let headerRowIndex = 0; 
      
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (row && Array.isArray(row)) {
          // Check if this row contains 'S No.' or 'Deposit Amount'
          const isHeaderRow = row.some(cell => {
            if (!cell) return false;
            const cleanCell = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanCell === 'sno' || cleanCell.includes('depositamount');
          });
          
          if (isHeaderRow) {
            headerRowIndex = i; // We found the exact row the bank table starts on!
            break;
          }
        }
      }

      // 2. Extract data starting EXACTLY from the dynamically found header row
      const rawData = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: null });
      
      rawData.forEach((row) => {
        let cleanRow = {};
        let sNoValue = null;
        
        for (let key in row) {
          if (key && !key.toString().startsWith('__EMPTY')) {
            cleanRow[key.toString().trim()] = row[key];
            
            // Forgiving check for the Serial Number column (ignores spacing/dots)
            const cleanKey = key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanKey === 'sno' || cleanKey === 'srno' || cleanKey === 'serialno') {
              sNoValue = row[key];
            }
          }
        }
        
        // 3. Only keep rows that have a valid numeric serial number (skips bank footers/totals)
        if (sNoValue !== null && sNoValue !== undefined && String(sNoValue).trim() !== '' && !isNaN(Number(sNoValue))) {
          extractedData.push(cleanRow);
        }
      });

// ==========================================
// ENGINE 1: MULTI-MODEL AI CASCADE
// ==========================================
// ==========================================
// UPLOAD & ROUTING CONTROLLER
// ==========================================
exports.uploadBankStatement = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let processingMode = req.body.processingMode || 'STANDARD'; 

    let extractedData = [];
    let rawTextForAI = "";

    // PARSE FILE
    if (fileType === 'application/pdf') {
      processingMode = 'AI';
      const pdfData = await pdfParse(fileBuffer);
      rawTextForAI = pdfData.text;
    } else {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // ==========================================
      // NEW: DYNAMIC HEADER SCANNER
      // ==========================================
      const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
      let headerRowIndex = 0; 
      
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (row && Array.isArray(row)) {
          const isHeaderRow = row.some(cell => {
            if (!cell) return false;
            const cleanCell = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanCell === 'sno' || cleanCell.includes('depositamount');
          });
          
          if (isHeaderRow) {
            headerRowIndex = i; // Found the exact row the headers start!
            break;
          }
        }
      }

      const rawData = xlsx.utils.sheet_to_json(sheet, { range: headerRowIndex, defval: null });
      
      rawData.forEach((row) => {
        let cleanRow = {};
        let sNoValue = null;
        
        for (let key in row) {
          if (key && !key.toString().startsWith('__EMPTY')) {
            cleanRow[key.toString().trim()] = row[key];
            
            const cleanKey = key.toString().toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanKey === 'sno' || cleanKey === 'srno' || cleanKey === 'serialno') {
              sNoValue = row[key];
            }
          }
        }
        
        // Skip footers/empty rows
        if (sNoValue !== null && sNoValue !== undefined && String(sNoValue).trim() !== '' && !isNaN(Number(sNoValue))) {
          extractedData.push(cleanRow);
        }
      });

      if (processingMode === 'AI') {
        rawTextForAI = JSON.stringify(extractedData.slice(0, 100)); 
      }
    }

    let reconciliationResults = { matched: [], suspense: [] };

    if (processingMode === 'AI') {
      try {
        reconciliationResults = await runAIEngine(rawTextForAI);
      } catch (error) {
        console.warn("⚠️ ALL AI MODELS FAILED. Falling back to Local Standard Engine.");
        reconciliationResults = await runStandardEngine(extractedData);
      }
    } else {
      reconciliationResults = await runStandardEngine(extractedData);
    }

    res.status(200).json({
      success: true,
      message: `Statement processed successfully.`,
      data: reconciliationResults
    });

  } catch (error) {
    console.error("Reconciliation Error:", error);
    res.status(500).json({ success: false, message: "Server error during file processing." });
  }
};

// ==========================================
// ENGINE 2: BULLETPROOF STANDARD MATCHER
// ==========================================
async function runStandardEngine(excelData) {
  let matched = [];
  let suspense = [];

  await Promise.all(excelData.map(async (row) => {
    const superCleanRow = {};
    for (const key in row) {
      if (key) {
        // Bulletproof header normalization
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, ''); 
        superCleanRow[cleanKey] = row[key];
      }
    }

    const depositAmount = superCleanRow['depositamountinr'] || superCleanRow['depositamount'] || superCleanRow['credit'];
    if (!depositAmount || depositAmount <= 0) return; 

    const date = superCleanRow['transactiondate'] || superCleanRow['valuedate'] || superCleanRow['date'];
    const remarks = superCleanRow['transactionremarks'] || superCleanRow['otherremarks'] || 'Unknown Deposit';

    const matchResult = await findInternalMatch(depositAmount, date, "Local Engine");

    if (matchResult) {
      matched.push({
        systemTransactionId: matchResult.systemTransactionId,
        bankDate: date,
        bankDescription: remarks,
        amount: Number(depositAmount),
        member: matchResult.member,
        confidence: matchResult.confidence
      });
    } else {
      suspense.push({
        bankDate: date,
        bankDescription: remarks,
        amount: Number(depositAmount),
        suggestedType: "UNKNOWN"
      });
    }
  }));

  return { matched, suspense };
}

// ==========================================
// 3. THE APPROVAL ENGINE 
// ==========================================
exports.approveReconciliation = async (req, res) => {
  try {
    const { matchedTransactions, suspenseDeposits } = req.body;

    // 1. CLEAR MATCHED TRANSACTIONS & BATCHES
    // Handles both single transaction IDs and batchIds simultaneously
    if (matchedTransactions && matchedTransactions.length > 0) {
      await TransactionLog.updateMany(
        { 
          $or: [
            { transactionId: { $in: matchedTransactions } },
            { batchId: { $in: matchedTransactions } } 
          ],
          status: 'PENDING_VERIFICATION' 
        },
        { $set: { status: 'COMPLETED' } }
      );
    }

    // 2. ROUTE UNKNOWN FUNDS TO SUSPENSE (Folio 101 & 999)
    if (suspenseDeposits && suspenseDeposits.length > 0) {
      const systemUser = await User.findOne({ role: 'ADMIN' }) || await User.findOne();

      for (const item of suspenseDeposits) {
        const suspenseEntries = [
          {
            vendorNo: 'SYS-SUSPENSE', 
            memberName: 'Unidentified Bank Deposit',
            memberId: systemUser ? systemUser._id : null,
            ledgerFolio: '101',
            category: 'BANK_RECEIPT',
            amount: item.amount,
            entryType: 'DEBIT',
            paymentMode: 'BANK_TRANSFER',
            transactionDate: item.bankDate ? new Date(item.bankDate) : new Date(),
            transactionId: `BANK-IN-SUSP-${Date.now()}-${Math.floor(Math.random()*1000)}`
          },
          {
            vendorNo: 'SYS-SUSPENSE',
            memberName: 'Unidentified Bank Deposit',
            memberId: systemUser ? systemUser._id : null,
            ledgerFolio: '999',
            category: 'SUSPENSE_CLEARING',
            amount: item.amount,
            entryType: 'CREDIT',
            paymentMode: 'INTERNAL_TRANSFER',
            transactionDate: item.bankDate ? new Date(item.bankDate) : new Date(),
            transactionId: `SUSP-CR-${Date.now()}-${Math.floor(Math.random()*1000)}`
          }
        ];

        await LedgerService.executeDoubleEntry(
          suspenseEntries, 
          `Unreconciled Deposit: ${item.bankDescription || 'Unknown'} - Ref: ${item.referenceNumber || 'N/A'}`
        );
      }
    }

    res.status(200).json({ success: true, message: "Reconciliation approved successfully." });

  } catch (error) {
    console.error("Approval Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};