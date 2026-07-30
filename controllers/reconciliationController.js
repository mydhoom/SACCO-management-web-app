const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User');
const LedgerService = require('../services/LedgerService'); 

// Initialize Gemini API
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
    console.error("Failed to parse Gemini output:", text);
    throw new Error("AI returned malformed data.");
  }
};

exports.uploadBankStatement = async (req, res) => {
  try {
    // 1. Validate Upload
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let processingMode = req.body.processingMode || 'STANDARD'; 

    let extractedData = [];
    let rawTextForAI = "";

    // 2. PARSE THE FILE BASED ON TYPE
    if (fileType === 'application/pdf') {
      processingMode = 'AI';
      const pdfData = await pdfParse(fileBuffer);
      rawTextForAI = pdfData.text;
      
    } else if (
      fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
      fileType === 'text/csv' ||
      fileType === 'application/vnd.ms-excel'
    ) {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      extractedData = xlsx.utils.sheet_to_json(sheet, { defval: null });
      
      if (processingMode === 'AI') {
        rawTextForAI = JSON.stringify(extractedData.slice(0, 100)); // Limit to avoid token overload
      }
    } else {
      return res.status(400).json({ success: false, message: "Unsupported file format. Please upload PDF, XLSX, or CSV." });
    }

    // 3. RUN THE SELECTED MATCHING ENGINE
    let reconciliationResults = { matched: [], suspense: [] };

    if (processingMode === 'AI') {
      reconciliationResults = await runAIEngine(rawTextForAI);
    } else {
      reconciliationResults = await runStandardEngine(extractedData);
    }

    // 4. RETURN TO MAKER-CHECKER DASHBOARD
    res.status(200).json({
      success: true,
      message: `Statement processed using ${processingMode} Engine. Awaiting admin approval.`,
      data: reconciliationResults
    });

  } catch (error) {
    console.error("Reconciliation Error:", error);
    res.status(500).json({ success: false, message: "Server error during file processing." });
  }
};

// ==========================================
// ENGINE 1: THE SMART AI MATCHER
// ==========================================
async function runAIEngine(rawText) {
  const prompt = `
    You are a highly skilled bank reconciliation assistant. 
    Read the following raw bank statement text. 
    Extract all deposits/credits into the account. Ignore withdrawals.
    
    For every deposit, figure out the date, the exact amount, and the reference number (UTR/Cheque).
    Try to guess the purpose (e.g., "EMI", "Bulk Salary", "Unknown").
    
    Return the result STRICTLY as a valid JSON array of objects with the following keys:
    "date", "amount", "referenceNumber", "description", "suggestedType".
    
    Raw Bank Statement:
    ${rawText}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });

  const parsedAIResults = extractCleanJSON(response.text);

  let matched = [];
  let suspense = [];

  // Run DB Queries concurrently for performance
  await Promise.all(parsedAIResults.map(async (item) => {
    if (!item.amount || isNaN(item.amount)) return;

    const internalMatch = await TransactionLog.findOne({
      amount: Number(item.amount),
      status: 'PENDING_VERIFICATION',
      entryType: 'DEBIT' 
    }).populate('memberId', 'name vendorNo');

    if (internalMatch) {
      matched.push({
        systemTransactionId: internalMatch.transactionId,
        bankDate: item.date,
        bankDescription: item.description,
        amount: Number(item.amount),
        member: internalMatch.memberId ? internalMatch.memberId.name : 'Unknown',
        confidence: "HIGH - Amount Matched"
      });
    } else {
      suspense.push({
        bankDate: item.date,
        bankDescription: item.description,
        referenceNumber: item.referenceNumber,
        amount: Number(item.amount),
        suggestedType: item.suggestedType
      });
    }
  }));

  return { matched, suspense };
}

// ==========================================
// ENGINE 2: THE STANDARD ALGORITHM MATCHER
// ==========================================
async function runStandardEngine(excelData) {
  let matched = [];
  let suspense = [];

  // Run DB queries concurrently
  await Promise.all(excelData.map(async (row) => {
    // Normalize keys to handle slight excel variations (e.g., trailing spaces)
    const normalizedRow = {};
    for (const key in row) {
      if (key) normalizedRow[key.trim().toLowerCase()] = row[key];
    }

    // Fallback logic to catch common column name variations
    const depositAmount = 
      row['Deposit Amount (INR )'] || 
      normalizedRow['deposit amount (inr)'] || 
      normalizedRow['credit'] || 
      normalizedRow['deposit amount'];

    if (!depositAmount || depositAmount <= 0) return; 

    const date = row['Transaction Date'] || normalizedRow['transaction date'] || normalizedRow['date'];
    const remarks = 
      row['Transaction Remarks '] || 
      row['Other Remarks '] || 
      normalizedRow['transaction remarks'] || 
      'Unknown Deposit';

    const internalMatch = await TransactionLog.findOne({
      amount: Number(depositAmount),
      status: 'PENDING_VERIFICATION'
    }).populate('memberId', 'name vendorNo');

    if (internalMatch) {
      matched.push({
        systemTransactionId: internalMatch.transactionId,
        bankDate: date,
        bankDescription: remarks,
        amount: Number(depositAmount),
        member: internalMatch.memberId ? internalMatch.memberId.name : 'Unknown',
        confidence: "HIGH"
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
// 3. THE APPROVAL ENGINE (Finalizing the Ledger)
// ==========================================
exports.approveReconciliation = async (req, res) => {
  try {
    const { matchedTransactions, suspenseDeposits } = req.body;

    // 1. CLEAR MATCHED TRANSACTIONS
    if (matchedTransactions && matchedTransactions.length > 0) {
      await TransactionLog.updateMany(
        { transactionId: { $in: matchedTransactions }, status: 'PENDING_VERIFICATION' },
        { $set: { status: 'COMPLETED' } }
      );
    }

    // 2. ROUTE UNKNOWN FUNDS TO SUSPENSE (Folio 999)
    if (suspenseDeposits && suspenseDeposits.length > 0) {
      const systemUser = await User.findOne({ role: 'ADMIN' }) || await User.findOne();

      // Sequential execution for ledger double-entry to prevent race conditions on balance calculations
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
          `Unreconciled Bank Deposit: ${item.bankDescription || 'Unknown AI Text'} - Ref: ${item.referenceNumber || 'N/A'}`
        );
      }
    }

    res.status(200).json({ 
      success: true, 
      message: "Reconciliation approved. Matched items cleared and unknowns routed to Suspense." 
    });

  } catch (error) {
    console.error("Approval Error:", error);
    res.status(500).json({ success: false, message: error.message || "Server error during reconciliation approval." });
  }
};