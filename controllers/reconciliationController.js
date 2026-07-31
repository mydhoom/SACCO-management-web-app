const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');
const { Groq } = require('groq-sdk');
const { GoogleGenAI } = require('@google/genai');
const TransactionLog = require('../models/TransactionLog');
const User = require('../models/User');
const LedgerService = require('../services/LedgerService'); 
const BankStatement = require('../models/BankStatement');

// 1. Initialize API Clients
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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

const parseBankDate = (dateVal) => {
  if (!dateVal) return "Unknown Date";
  if (!isNaN(dateVal) && typeof dateVal === 'number') {
    const jsDate = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
    return jsDate.toLocaleDateString('en-GB'); 
  }
  return String(dateVal).trim();
};

const isDateInPeriod = (dateStr, targetMonth, targetFY) => {
  if (!dateStr || !dateStr.includes('/')) return false;
  try {
    const [d, m, y] = dateStr.split('/');
    const monthInt = parseInt(m, 10);
    const yearInt = parseInt(y, 10);
    
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const targetMonthIndex = months.indexOf(targetMonth) + 1;
    
    const [startYear, endYear] = targetFY.split('-').map(Number);
    const targetYear = (targetMonthIndex >= 1 && targetMonthIndex <= 3) ? endYear : startYear;
    
    return (monthInt === targetMonthIndex) && (yearInt === targetYear);
  } catch (e) {
    return false;
  }
};

async function findInternalMatch(depositAmount, bankDate, aiModelName = "Local Engine") {
  const amount = Number(depositAmount);
  
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
    windowEnd.setDate(windowEnd.getDate() + 4); 
    return dDate >= uploadDate && dDate <= windowEnd;
  });

  if (validBatchMatch) {
    return {
      systemTransactionId: validBatchMatch._id,
      member: `Batch of ${validBatchMatch.count} Payments`,
      confidence: `HIGH - Batch Match [1-to-4 Day Window] (${aiModelName})`
    };
  }

  return null; 
}

exports.uploadBankStatement = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded." });

    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;
    let processingMode = req.body.processingMode || 'STANDARD'; 
    const financialYear = req.body.financialYear || '2023-2024'; 
    const month = req.body.month || 'April'; 

    let extractedData = [];
    let rawTextForAI = "";
    
    let metadata = { bankName: "Not Found", accountNo: "Not Found", statementPeriod: "Not Found" };

    if (fileType === 'application/pdf') {
      processingMode = 'AI';
      const pdfData = await pdfParse(fileBuffer);
      rawTextForAI = pdfData.text;
    } else {
      const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      const rawRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });
      let headerRowIndex = 0; 
      
      const topRows = rawRows.slice(0, 15);
      topRows.forEach(row => {
        if (!row || !Array.isArray(row)) return;
        
        const validCells = row.filter(cell => cell !== null && cell !== '');
        if (validCells.length === 0 || validCells.length > 3) return; 

        const rowStr = validCells.join(' ').replace(/\s+/g, ' ').trim();
        const lowerStr = rowStr.toLowerCase();

        if (rowStr.length === 0) return;

        if (rowStr.match(/\d{2}[\/\-]\d{2}[\/\-]\d{4}/)) return;

        if ((lowerStr.includes('account no') || lowerStr.includes('a/c no')) && metadata.accountNo === "Not Found") {
          const match = rowStr.match(/[\d]{9,18}/); 
          if (match) metadata.accountNo = match[0];
        }
        if ((lowerStr.includes('period') || lowerStr.includes('statement from') || lowerStr.includes('date:')) && metadata.statementPeriod === "Not Found") {
          metadata.statementPeriod = rowStr;
        }
        if ((lowerStr.includes('bank') || lowerStr.includes('limited') || lowerStr.includes('ltd')) && metadata.bankName === "Not Found" && !lowerStr.includes('statement') && !lowerStr.includes('utr') && !lowerStr.includes('neft')) {
          metadata.bankName = rowStr;
        }
      });
      
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (row && Array.isArray(row)) {
          const isHeaderRow = row.some(cell => {
            if (!cell) return false;
            const cleanCell = String(cell).toLowerCase().replace(/[^a-z0-9]/g, '');
            return cleanCell === 'sno' || cleanCell.includes('depositamount');
          });
          
          if (isHeaderRow) {
            headerRowIndex = i; 
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
        
        if (sNoValue !== null && sNoValue !== undefined && String(sNoValue).trim() !== '' && !isNaN(Number(sNoValue))) {
          extractedData.push(cleanRow);
        }
      });

      if (processingMode === 'AI') {
        rawTextForAI = JSON.stringify(extractedData); 
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

    let trueClosingBalance = 0;
    if (extractedData.length > 0) {
      for (let i = extractedData.length - 1; i >= 0; i--) {
        const cleanRow = {};
        for (const key in extractedData[i]) {
          if (key) cleanRow[key.toLowerCase().replace(/[^a-z0-9]/g, '')] = extractedData[i][key];
        }
        const bal = Number(cleanRow['balanceinr'] || cleanRow['balance']);
        if (bal && !isNaN(bal) && bal !== 0) {
          trueClosingBalance = bal;
          break;
        }
      }
    }

    reconciliationResults.matched = reconciliationResults.matched.filter(item => isDateInPeriod(item.bankDate, month, financialYear));
    reconciliationResults.suspense = reconciliationResults.suspense.filter(item => isDateInPeriod(item.bankDate, month, financialYear));

    res.status(200).json({
      success: true,
      message: `Statement processed successfully for ${month} ${financialYear}.`,
      data: { ...reconciliationResults, metadata, trueClosingBalance }
    });

  } catch (error) {
    console.error("Reconciliation Error:", error);
    res.status(500).json({ success: false, message: "Server error during file processing." });
  }
};

async function runAIEngine(rawText) {
  const prompt = `
    You are a bank reconciliation assistant. Read the bank statement text. 
    Extract ALL transactions (both deposits and withdrawals).
    Return STRICTLY a JSON object with a single key "transactions" containing an array of objects:
    "date", "debit" (number, 0 if empty), "credit" (number, 0 if empty), "balance" (number, 0 if empty), "referenceNumber", "description", "suggestedType".
    Statement: ${rawText}
  `;

  let parsedAIResults = null;
  let successfulModel = "";

  const aiCascade = [
    { provider: 'groq', model: 'llama-3.3-70b-versatile', name: 'Groq Advanced' },
    { provider: 'groq', model: 'llama-3.1-8b-instant', name: 'Groq Standard' },
    { provider: 'gemini', model: 'gemini-1.5-pro', name: 'Gemini Advanced' },
    { provider: 'gemini', model: 'gemini-1.5-flash', name: 'Gemini Standard' }
  ];

  for (const aiStep of aiCascade) {
    try {
      console.log(`[AI Cascade] Attempting: ${aiStep.name}...`);
      if (aiStep.provider === 'groq') {
        const response = await groq.chat.completions.create({
          model: aiStep.model,
          messages: [
            { role: 'system', content: 'You strictly output valid JSON objects.' },
            { role: 'user', content: prompt }
          ],
          response_format: { type: 'json_object' }
        });
        parsedAIResults = JSON.parse(response.choices[0].message.content).transactions;
      } else {
        const response = await ai.models.generateContent({
          model: aiStep.model,
          contents: prompt
        });
        const rawJson = extractCleanJSON(response.text);
        parsedAIResults = Array.isArray(rawJson) ? rawJson : (rawJson.transactions || []);
      }
      
      if (parsedAIResults && Array.isArray(parsedAIResults)) {
        successfulModel = aiStep.name;
        break; 
      }
    } catch (error) {
      console.warn(`[WARNING] ${aiStep.name} failed. Moving to next...`);
    }
  }

  if (!parsedAIResults || parsedAIResults.length === 0) {
    throw new Error("All AI models failed.");
  }

  let matched = [];
  let suspense = [];

  await Promise.all(parsedAIResults.map(async (item) => {
    const cleanDate = parseBankDate(item.date);
    const creditAmt = Number(item.credit) || 0;
    const debitAmt = Number(item.debit) || 0;
    const balanceAmt = Number(item.balance) || 0;

    if (creditAmt > 0) {
      const matchResult = await findInternalMatch(creditAmt, cleanDate, successfulModel);

      if (matchResult) {
        matched.push({
          systemTransactionId: matchResult.systemTransactionId,
          bankDate: cleanDate,
          bankDescription: item.description,
          credit: creditAmt,
          debit: 0,
          balance: balanceAmt,
          member: matchResult.member,
          confidence: matchResult.confidence,
          status: 'MATCHED'
        });
      } else {
        suspense.push({
          bankDate: cleanDate,
          bankDescription: item.description,
          referenceNumber: item.referenceNumber,
          credit: creditAmt,
          debit: 0,
          balance: balanceAmt,
          suggestedType: item.suggestedType || "UNRECONCILED DEPOSIT",
          status: 'UNRECONCILED'
        });
      }
    } else if (debitAmt > 0) {
      suspense.push({
          bankDate: cleanDate,
          bankDescription: item.description,
          referenceNumber: item.referenceNumber,
          credit: 0,
          debit: debitAmt,
          balance: balanceAmt,
          suggestedType: "BANK DEBIT",
          status: 'DEBIT'
      });
    }
  }));

  return { matched, suspense };
}

async function runStandardEngine(excelData) {
  let matched = [];
  let suspense = [];

  await Promise.all(excelData.map(async (row) => {
    const superCleanRow = {};
    for (const key in row) {
      if (key) {
        const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, ''); 
        superCleanRow[cleanKey] = row[key];
      }
    }

    const creditAmount = Number(superCleanRow['depositamountinr'] || superCleanRow['depositamount'] || superCleanRow['credit']) || 0;
    const debitAmount = Number(superCleanRow['withdrawalamountinr'] || superCleanRow['withdrawalamount'] || superCleanRow['debit']) || 0;
    const balanceAmount = Number(superCleanRow['balanceinr'] || superCleanRow['balance']) || 0;

    const rawDate = superCleanRow['transactiondate'] || superCleanRow['valuedate'] || superCleanRow['date'];
    const cleanDate = parseBankDate(rawDate);
    
    const remarks = superCleanRow['transactionremarks'] || superCleanRow['otherremarks'] || 'Unknown Transaction';

    if (creditAmount > 0) {
      const matchResult = await findInternalMatch(creditAmount, cleanDate, "Local Engine");

      if (matchResult) {
        matched.push({
          systemTransactionId: matchResult.systemTransactionId,
          bankDate: cleanDate,
          bankDescription: remarks,
          credit: creditAmount,
          debit: 0,
          balance: balanceAmount,
          member: matchResult.member,
          confidence: matchResult.confidence,
          status: 'MATCHED'
        });
      } else {
        suspense.push({
          bankDate: cleanDate,
          bankDescription: remarks,
          credit: creditAmount,
          debit: 0,
          balance: balanceAmount,
          suggestedType: "UNRECONCILED DEPOSIT",
          status: 'UNRECONCILED'
        });
      }
    } else if (debitAmount > 0) {
      suspense.push({
          bankDate: cleanDate,
          bankDescription: remarks,
          credit: 0,
          debit: debitAmount,
          balance: balanceAmount,
          suggestedType: "BANK DEBIT",
          status: 'DEBIT'
      });
    }
  }));

  return { matched, suspense };
}

exports.approveReconciliation = async (req, res) => {
  try {
    const { matchedTransactions, suspenseDeposits } = req.body;

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

    if (suspenseDeposits && suspenseDeposits.length > 0) {
      const systemUser = await User.findOne({ role: 'ADMIN' }) || await User.findOne();

      for (const item of suspenseDeposits) {
        if (item.status === 'DEBIT') continue;

        const suspenseEntries = [
          {
            vendorNo: 'SYS-SUSPENSE', 
            memberName: 'Unidentified Bank Deposit',
            memberId: systemUser ? systemUser._id : null,
            ledgerFolio: '101',
            category: 'BANK_RECEIPT',
            amount: item.credit, 
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
            amount: item.credit,
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

exports.saveAndGenerateBRS = async (req, res) => {
  try {
    const { financialYear, month, metadata, matched, suspense, closingBalance } = req.body;

    if (!financialYear || !month) {
      return res.status(400).json({ success: false, message: "Financial Year and Month are required." });
    }

    const matchedIds = (matched || []).map(m => m.systemTransactionId);
    const pendingSystemTx = await TransactionLog.find({ status: 'PENDING_VERIFICATION' }).populate('memberId', 'name vendorNo');
    
    let unclearedReceipts = []; 
    let unclearedPayments = []; 
    
    pendingSystemTx.forEach(tx => {
      if (matchedIds.includes(tx.transactionId)) return; 
      
      const txData = {
        date: tx.transactionDate.toLocaleDateString('en-GB'),
        description: tx.description || tx.category,
        amount: tx.amount,
        transactionId: tx.transactionId,
        member: tx.memberId ? tx.memberId.name : 'Unknown'
      };

      if (tx.entryType === 'DEBIT') unclearedReceipts.push(txData); 
      else if (tx.entryType === 'CREDIT') unclearedPayments.push(txData); 
    });

    const totalUnclearedReceipts = unclearedReceipts.reduce((sum, item) => sum + item.amount, 0);
    const totalUnclearedPayments = unclearedPayments.reduce((sum, item) => sum + item.amount, 0);
    
    const totalUnidentifiedDeposits = (suspense || []).reduce((sum, item) => sum + (Number(item.credit) || 0), 0);
    const totalDirectBankDebits = (suspense || []).reduce((sum, item) => sum + (Number(item.debit) || 0), 0);

    const validBalances = (suspense || []).map(s => Number(s.balance)).filter(b => !isNaN(b) && b > 0);
    const calculatedClosingBalance = validBalances.length > 0 ? validBalances[validBalances.length - 1] : 0;
    const closingBankBalance = closingBalance !== undefined && closingBalance !== 0 ? closingBalance : calculatedClosingBalance;

    const systemCashBookBalance = closingBankBalance - totalUnidentifiedDeposits - totalUnclearedPayments + totalDirectBankDebits + totalUnclearedReceipts;

    const brsSummary = {
      systemCashBookBalance,
      totalUnidentifiedDeposits,
      totalUnclearedPayments,
      totalDirectBankDebits,
      totalUnclearedReceipts,
      closingBankBalance,
      unclearedReceiptsDetails: unclearedReceipts,
      unclearedPaymentsDetails: unclearedPayments
    };

    const statementDoc = await BankStatement.findOneAndUpdate(
      { financialYear, month },
      {
        financialYear,
        month,
        bankName: metadata?.bankName || "Unknown",
        accountNumber: metadata?.accountNo || "Unknown",
        statementPeriod: metadata?.statementPeriod || "Unknown",
        closingBankBalance,
        totalUnidentifiedDeposits,
        totalDirectBankDebits,
        matchedTransactions: matched || [],
        suspenseEntries: suspense || [],
        brsSummary: brsSummary
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, message: "BRS Saved Successfully.", data: statementDoc });

  } catch (error) {
    console.error("BRS Generation Error:", error);
    res.status(500).json({ success: false, message: "Server error generating BRS." });
  }
};

exports.getStatementByPeriod = async (req, res) => {
  try {
    const { financialYear, month } = req.query;
    if (!financialYear || !month) return res.status(400).json({ success: false, message: "Financial Year and Month required." });

    const statement = await BankStatement.findOne({ financialYear, month });
    
    if (statement) {
      return res.status(200).json({ success: true, data: statement });
    }
    
    return res.status(200).json({ success: true, data: null, message: "No statement found for this period. Please upload one." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// YEARLY CONSOLIDATION ENGINE
// ==========================================
exports.getYearlyStatement = async (req, res) => {
  try {
    const { financialYear } = req.query;
    if (!financialYear) return res.status(400).json({ success: false, message: "Financial Year required." });

    const statements = await BankStatement.find({ financialYear });
    if (!statements || statements.length === 0) {
      return res.status(200).json({ success: true, data: null, message: "No saved statements found for this financial year." });
    }

    const monthOrder = ['April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March'];
    statements.sort((a, b) => monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month));

    let consolidatedMatched = [];
    let consolidatedSuspense = [];
    let totalUnidentifiedDeposits = 0;
    let totalDirectBankDebits = 0;
    let totalUnclearedPayments = 0;
    let totalUnclearedReceipts = 0;

    const closingBankBalance = statements[statements.length - 1].closingBankBalance;

    statements.forEach(st => {
      consolidatedMatched.push(...(st.matchedTransactions || []));
      consolidatedSuspense.push(...(st.suspenseEntries || []));
      totalUnidentifiedDeposits += (st.totalUnidentifiedDeposits || 0);
      totalDirectBankDebits += (st.totalDirectBankDebits || 0);
      totalUnclearedPayments += (st.brsSummary?.totalUnclearedPayments || 0);
      totalUnclearedReceipts += (st.brsSummary?.totalUnclearedReceipts || 0);
    });

    const systemCashBookBalance = closingBankBalance - totalUnidentifiedDeposits - totalUnclearedPayments + totalDirectBankDebits + totalUnclearedReceipts;

    const yearlyDoc = {
      financialYear,
      month: 'Full Financial Year',
      bankName: statements[0].bankName,
      accountNumber: statements[0].accountNumber,
      statementPeriod: `Financial Year ${financialYear}`,
      closingBankBalance,
      totalUnidentifiedDeposits,
      totalDirectBankDebits,
      matchedTransactions: consolidatedMatched,
      suspenseEntries: consolidatedSuspense,
      brsSummary: {
        systemCashBookBalance,
        totalUnidentifiedDeposits,
        totalUnclearedPayments,
        totalDirectBankDebits,
        totalUnclearedReceipts,
        closingBankBalance,
        unclearedReceiptsDetails: [],
        unclearedPaymentsDetails: []
      },
      isYearly: true,
      createdAt: statements[statements.length - 1].createdAt
    };

    return res.status(200).json({ success: true, data: yearlyDoc });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};