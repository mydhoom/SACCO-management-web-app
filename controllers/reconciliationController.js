const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User');
const LedgerService = require('../services/LedgerService'); // Ensure Enforcer is imported at the top

// Initialize Gemini API (Ensure GEMINI_API_KEY is in your .env file)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

exports.uploadBankStatement = async (req, res) => {
  try {
    // 1. Validate Upload
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded." });
    }

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    // The frontend will send the requested mode ('STANDARD' or 'AI')
    let processingMode = req.body.processingMode || 'STANDARD'; 

    let extractedData = [];
    let rawTextForAI = "";

    // 2. PARSE THE FILE BASED ON TYPE
    if (fileType === 'application/pdf') {
      // PDF handling: Force AI mode, as algorithmic parsing is unreliable
      processingMode = 'AI';
      const pdfData = await pdfParse(fileBuffer);
      rawTextForAI = pdfData.text;
      
    } else if (fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || fileType === 'text/csv') {
      // Excel/CSV handling
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to JSON. (We skip the first 27 rows based on your bank's specific format)
      // For production, you can make the 'range' dynamic or leave it open to parse all text
      extractedData = xlsx.utils.sheet_to_json(sheet, { defval: null });
      
      // If AI mode is selected for Excel, we stringify the data for the AI to read
      if (processingMode === 'AI') {
        rawTextForAI = JSON.stringify(extractedData.slice(0, 100)); // Limit to avoid token overload
      }
    } else {
      return res.status(400).json({ success: false, message: "Unsupported file format. Please upload PDF, XLSX, or CSV." });
    }

    // 3. RUN THE SELECTED MATCHING ENGINE
    let reconciliationResults = {
      matched: [],
      suspense: [] // Unmapped funds going to Folio 999
    };

    if (processingMode === 'AI') {
      reconciliationResults = await runAIEngine(rawTextForAI);
    } else {
      reconciliationResults = await runStandardEngine(extractedData);
    }

    // 4. RETURN TO MAKER-CHECKER DASHBOARD
    // We DO NOT save to the database yet. The admin must review this on the frontend.
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
  // We give the AI strict instructions to return a JSON array
  const prompt = `
    You are a highly skilled bank reconciliation assistant. 
    Read the following raw bank statement text. 
    Extract all deposits/credits into the account. 
    Ignore withdrawals.
    
    For every deposit, figure out the date, the exact amount, and the reference number (UTR/Cheque).
    Try to guess the purpose (e.g., "EMI", "Bulk Salary", "Unknown").
    
    Return the result STRICTLY as a valid JSON array of objects with the following keys:
    "date", "amount", "referenceNumber", "description", "suggestedType".
    
    Raw Bank Statement:
    ${rawText}
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.6-flash', // Fast and cheap for text processing
    contents: prompt,
  });

  // Clean the AI output to extract the JSON
  let aiText = response.text;
  aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsedAIResults = JSON.parse(aiText);

  let matched = [];
  let suspense = [];

  // Loop through AI results and check our internal Ledger
  for (const item of parsedAIResults) {
    // Look for pending transactions in our system that match the AI's found amount
    const internalMatch = await TransactionLog.findOne({
      amount: item.amount,
      status: 'PENDING_VERIFICATION',
      entryType: 'DEBIT' 
    }).populate('memberId', 'name vendorNo');

    if (internalMatch) {
      matched.push({
        systemTransactionId: internalMatch.transactionId,
        bankDate: item.date,
        bankDescription: item.description,
        amount: item.amount,
        member: internalMatch.memberId ? internalMatch.memberId.name : 'Unknown',
        confidence: "HIGH - Amount Matched"
      });
    } else {
      // If we don't know what this is, throw it to Folio 999
      suspense.push({
        bankDate: item.date,
        bankDescription: item.description,
        referenceNumber: item.referenceNumber,
        amount: item.amount,
        suggestedType: item.suggestedType
      });
    }
  }

  return { matched, suspense };
}

// ==========================================
// ENGINE 2: THE STANDARD ALGORITHM MATCHER
// ==========================================
async function runStandardEngine(excelData) {
  let matched = [];
  let suspense = [];

  for (const row of excelData) {
    // Skip empty rows or withdrawals based on the H.P. State Co-op headers
    const depositAmount = row['Deposit Amount (INR )'];
    if (!depositAmount || depositAmount <= 0) continue; 

    const date = row['Transaction Date'];
    const remarks = row['Transaction Remarks '] || row['Other Remarks '] || 'Unknown Deposit';

    // Strict search in our database
    const internalMatch = await TransactionLog.findOne({
      amount: depositAmount,
      status: 'PENDING_VERIFICATION'
    }).populate('memberId', 'name vendorNo');

    if (internalMatch) {
      matched.push({
        systemTransactionId: internalMatch.transactionId,
        bankDate: date,
        bankDescription: remarks,
        amount: depositAmount,
        member: internalMatch.memberId ? internalMatch.memberId.name : 'Unknown',
        confidence: "HIGH"
      });
    } else {
      suspense.push({
        bankDate: date,
        bankDescription: remarks,
        amount: depositAmount,
        suggestedType: "UNKNOWN"
      });
    }
  }

  return { matched, suspense };
}
// ==========================================
// 3. THE APPROVAL ENGINE (Finalizing the Ledger)
// ==========================================
exports.approveReconciliation = async (req, res) => {
  try {
    // These arrays come from your React frontend after the admin reviews the parser's output
    const { matchedTransactions, suspenseDeposits } = req.body;

    // 1. CLEAR MATCHED TRANSACTIONS
    if (matchedTransactions && matchedTransactions.length > 0) {
      // Find all pending transactions that the algorithm matched and clear them
      await TransactionLog.updateMany(
        { transactionId: { $in: matchedTransactions }, status: 'PENDING_VERIFICATION' },
        { $set: { status: 'COMPLETED' } }
      );
    }

    // 2. ROUTE UNKNOWN FUNDS TO SUSPENSE (Folio 999)
    if (suspenseDeposits && suspenseDeposits.length > 0) {
      
      // Fetch the first Admin/System user to act as the placeholder for unknown funds
      // Alternatively, you can create a dedicated "Suspense Account" user in your DB
      const systemUser = await User.findOne({ role: 'ADMIN' }) || await User.findOne();

      for (const item of suspenseDeposits) {
        const suspenseEntries = [
          // DEBIT: The money hitting the bank
          {
            vendorNo: 'SYS-SUSPENSE', 
            memberName: 'Unidentified Bank Deposit',
            memberId: systemUser._id, // Schema requires an ObjectId
            ledgerFolio: '101',
            category: 'BANK_RECEIPT',
            amount: item.amount,
            entryType: 'DEBIT',
            paymentMode: 'BANK_TRANSFER',
            transactionDate: item.bankDate ? new Date(item.bankDate) : new Date(),
            transactionId: `BANK-IN-SUSP-${Date.now()}-${Math.floor(Math.random()*1000)}`
          },
          // CREDIT: Parking the money in Liability (Folio 999)
          {
            vendorNo: 'SYS-SUSPENSE',
            memberName: 'Unidentified Bank Deposit',
            memberId: systemUser._id,
            ledgerFolio: '999',
            category: 'SUSPENSE_CLEARING',
            amount: item.amount,
            entryType: 'CREDIT',
            paymentMode: 'INTERNAL_TRANSFER',
            transactionDate: item.bankDate ? new Date(item.bankDate) : new Date(),
            transactionId: `SUSP-CR-${Date.now()}-${Math.floor(Math.random()*1000)}`
          }
        ];

        // Push through the Enforcer to guarantee Balance Sheet integrity
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