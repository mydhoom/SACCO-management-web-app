const xlsx = require('xlsx');
const User = require('../models/User');
const Loan = require('../models/Loan');
const TransactionLog = require('../models/TransactionLog');
const LedgerService = require('../services/LedgerService');
const { v4: uuidv4 } = require("uuid");

exports.uploadHistoricalLoans = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0]; // Assuming first sheet
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    if (data.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel sheet is empty.' });
    }

    const results = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      errors: []
    };

    for (const [index, row] of data.entries()) {
      results.totalProcessed++;
      const rowNumber = index + 2; // +1 for 0-index, +1 for header

      try {
        // Support multiple column header variations (vendorNo, Vendor_No, Vendor No, EmpNo, etc.)
        const rawVendorNo = row.vendorNo || row.Vendor_No || row['Vendor No'] || row['vendor_no'] || row['VendorNo'] || row['EMP_NO'] || row['EmpNo'] || row['Emp_No'];
        const vendorNo = rawVendorNo ? String(rawVendorNo).trim() : null;

        const rawLoanAmount = row.loanAmount || row.Loan_Amount || row['Loan Amount'] || row['loan_amount'] || row['Amount'] || row['Principal'];
        const loanAmount = Number(String(rawLoanAmount || 0).replace(/₹|,|\s/g, ''));

        const rawInterestRate = row.interestRate || row.Interest_Rate || row['Interest Rate'] || row['interest_rate'] || row['Interest'];
        const interestRate = Number(rawInterestRate) || 10;

        const rawTenure = row.tenure || row.Tenure || row['Tenure (Months)'] || row['Months'];
        const tenure = Number(rawTenure) || 12;

        const rawOutstanding = row.currentOutstanding || row.Current_Outstanding || row['Current Outstanding'] || row['Pending_Principal'] || row['Pending Principal'] || row['Outstanding'];
        const currentOutstanding = Number(String(rawOutstanding || 0).replace(/₹|,|\s/g, ''));

        const rawDate = row.issueDate || row.Issue_Date || row['Issue Date'] || row['Date'];
        let issueDate = new Date();
        if (rawDate) {
          const parsed = new Date(rawDate);
          if (!isNaN(parsed.getTime())) {
            issueDate = parsed;
          }
        }

        if (!vendorNo || !loanAmount) {
          throw new Error(`Missing Vendor No or Loan Amount (Vendor No: ${vendorNo || 'Empty'}, Loan Amount: ${loanAmount || 0}).`);
        }

        // --- FLEXIBLE USER LOOKUP ---
        // 1. Exact match
        let user = await User.findOne({ vendorNo });

        // 2. Number-only / prefix-stripped match (e.g. EMP-1045 matches 1045)
        if (!user) {
          const digitsOnly = vendorNo.replace(/\D/g, '');
          if (digitsOnly) {
            user = await User.findOne({
              $or: [
                { vendorNo: digitsOnly },
                { vendorNo: new RegExp(digitsOnly + '$', 'i') }
              ]
            });
          }
        }

        // 3. Auto-create member if not found so historical loan upload never blocks!
        if (!user) {
          user = new User({
            vendorNo: vendorNo,
            name: row.memberName || row.Member_Name || row['Member Name'] || `Member ${vendorNo}`,
            password: 'DefaultPassword123!',
            status: 'approved',
            role: 'member'
          });
          await user.save();
        }

        // --- DUPLICATE PREVENTION CHECK ---
        // Check if an identical historical loan already exists for this member with the same loanAmount and issueDate
        const duplicateLoan = await Loan.findOne({
          memberId: user._id,
          loanAmount: loanAmount,
          startDate: issueDate
        });

        if (duplicateLoan) {
          throw new Error(`Duplicate entry ignored: Loan of ₹${loanAmount} for ${vendorNo} on ${issueDate.toISOString().split('T')[0]} already exists.`);
        }

        // 1. Create the historical Loan record
        const existingLoansCount = await Loan.countDocuments({ memberId: user._id });
        const loanId = `${user.vendorNo}-${existingLoansCount + 1}-HIST`;

        const endDate = new Date(issueDate);
        endDate.setMonth(endDate.getMonth() + (isNaN(tenure) ? 12 : tenure));

        const newLoan = new Loan({
          loanId,
          memberId: user._id,
          loanAmount: loanAmount,
          interestRate: interestRate,
          tenure: tenure,
          sharePaymentMethod: 'DEDUCT_FROM_LOAN',
          startDate: issueDate,
          endDate: endDate,
          status: currentOutstanding > 0 ? "ACTIVE" : "CLOSED",
          disbursalDate: issueDate
        });
        await newLoan.save();

        // 2. Create historical ledger entries for disbursement (LOAN_PRINCIPAL_FOLIO: 152)
        const batchId = `HIST-${uuidv4()}`;
        const exactMemberName = user.name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown Member';

        const transactionsToLog = [];

        // Log the initial disbursement (Debit to 152)
        transactionsToLog.push({
          vendorNo: user.vendorNo, 
          memberName: exactMemberName, 
          ledgerFolio: '152', 
          memberId: user._id,
          category: "LOAN_DISBURSEMENT", 
          amount: loanAmount, 
          entryType: "DEBIT", 
          paymentMode: "INTERNAL_TRANSFER",
          transactionId: `HIST-DISB-${uuidv4()}`, 
          status: "COMPLETED", 
          relatedLoanId: newLoan._id, 
          batchId: batchId,
          transactionDate: issueDate,
          description: "Historical Loan Disbursement (FY 23-24)"
        });

        // If there are payments made, log them as a single historical repayment to arrive at currentOutstanding
        const totalPrincipalPaid = loanAmount - currentOutstanding;
        
        if (totalPrincipalPaid > 0) {
          transactionsToLog.push({
            vendorNo: user.vendorNo, 
            memberName: exactMemberName, 
            ledgerFolio: '152', 
            memberId: user._id,
            category: "LOAN_REPAYMENT", 
            amount: totalPrincipalPaid, 
            entryType: "CREDIT", 
            paymentMode: "INTERNAL_TRANSFER",
            transactionId: `HIST-REPAY-${uuidv4()}`, 
            status: "COMPLETED", 
            relatedLoanId: newLoan._id, 
            batchId: batchId,
            transactionDate: new Date(), // Using current date for the aggregate history sync
            description: "Aggregate Historical Principal Repayment"
          });
        }

        if (transactionsToLog.length > 0) {
          await TransactionLog.insertMany(transactionsToLog);
        }

        // 3. Update User balances
        user.activeLoanAmount = (user.activeLoanAmount || 0) + (currentOutstanding > 0 ? loanAmount : 0);
        user.pendingLoanBalance = (user.pendingLoanBalance || 0) + currentOutstanding;
        await user.save();

        results.successCount++;

      } catch (err) {
        results.errorCount++;
        results.errors.push(`Row ${rowNumber} [${row.vendorNo || 'Unknown'}]: ${err.message}`);
      }
    }

    res.status(200).json({ success: true, results });

  } catch (error) {
    console.error('Excel Upload Error:', error);
    res.status(500).json({ success: false, message: 'Server error during upload.' });
  }
};
